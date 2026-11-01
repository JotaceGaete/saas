using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.Extensions.Logging;

namespace WalinkaPrintConnector;

/// <summary>
/// API HTTP versión 1, escuchando solo en 127.0.0.1.
/// Capas: Host exacto -> CORS por origen exacto -> token ligado al origen -> validación -> cola de Windows.
/// </summary>
public static class ConnectorServer
{
    public const string ApiVersion = "1";
    public const string AppVersion = "0.3.0";

    public sealed record PairRequest(string Code, string? DeviceName);
    public sealed record PrintRequest(string IdempotencyKey, string PrinterName, int Copies, string DataBase64);
    public sealed record TestRequest(string PrinterName);

    public static async Task RunAsync(string dataDir, ConnectorConfig config, CancellationToken ct)
    {
        var audit = new Audit(dataDir);
        var pairing = new PairingStore(dataDir);
        var jobs = new JobStore(dataDir);
        var spoolerGate = new SemaphoreSlim(1, 1);
        var printLimiter = new SlidingWindowLimiter(60, TimeSpan.FromMinutes(1));
        var pairLimiter = new SlidingWindowLimiter(10, TimeSpan.FromMinutes(1));

        var builder = WebApplication.CreateSlimBuilder(Array.Empty<string>());
        builder.Logging.ClearProviders();
        builder.WebHost.ConfigureKestrel(options =>
        {
            options.Listen(IPAddress.Loopback, config.Port);
            options.Limits.MaxRequestBodySize = 512 * 1024;
        });

        var app = builder.Build();

        app.Use(async (ctx, next) =>
        {
            if (!HostPolicy.IsAllowed(ctx.Request.Host.ToString(), config.Port))
            {
                ctx.Response.StatusCode = StatusCodes.Status400BadRequest;
                await ctx.Response.WriteAsJsonAsync(new { error = "invalid_host" });
                return;
            }

            var origin = ctx.Request.Headers.Origin.ToString();
            var originAllowed = OriginPolicy.IsAllowed(origin, config.AllowedOrigins);
            if (originAllowed)
            {
                ctx.Response.Headers["Access-Control-Allow-Origin"] = origin;
                ctx.Response.Headers["Vary"] = "Origin";
                ctx.Response.Headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
                ctx.Response.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
                ctx.Response.Headers["Access-Control-Max-Age"] = "600";
                // Chrome/Edge: un sitio público que llama a localhost pide este permiso en el preflight.
                if (ctx.Request.Headers["Access-Control-Request-Private-Network"].ToString() == "true")
                {
                    ctx.Response.Headers["Access-Control-Allow-Private-Network"] = "true";
                }
            }

            if (HttpMethods.IsOptions(ctx.Request.Method))
            {
                ctx.Response.StatusCode = originAllowed ? StatusCodes.Status204NoContent : StatusCodes.Status403Forbidden;
                return;
            }

            await next();
        });

        IResult? Authorize(HttpContext ctx)
        {
            var origin = ctx.Request.Headers.Origin.ToString();
            if (!OriginPolicy.IsAllowed(origin, config.AllowedOrigins)) return Deny(403, "origin_not_allowed");

            var header = ctx.Request.Headers.Authorization.ToString();
            if (!header.StartsWith("Bearer ", StringComparison.Ordinal)) return Deny(401, "unauthorized");

            var token = header["Bearer ".Length..].Trim();
            return pairing.Authenticate(token, origin) ? null : Deny(401, "unauthorized");
        }

        async Task<IResult> PrintGuardedAsync(string printerName, byte[] bytes, string docName, string? idempotencyKey, string origin)
        {
            var now = DateTime.UtcNow;
            await spoolerGate.WaitAsync(ct);
            try
            {
                var printer = Spooler.FindPrinter(printerName);
                if (printer is null)
                {
                    audit.Write("print", origin, printerName, idempotencyKey, "printer_not_found");
                    return Deny(404, "printer_not_found");
                }

                var problems = Spooler.DescribeStatus(printer.Status);
                if (problems.Count > 0)
                {
                    audit.Write("print", origin, printer.Name, idempotencyKey, "printer_unavailable");
                    return Results.Json(new { error = "printer_unavailable", problems }, statusCode: 409);
                }

                if (idempotencyKey is not null)
                {
                    var outcome = jobs.Begin(idempotencyKey, printer.Name, now, out var existing);
                    if (outcome == JobStore.BeginOutcome.Duplicate)
                    {
                        audit.Write("print", origin, printer.Name, idempotencyKey, "duplicate_ignored");
                        return Results.Json(new { status = existing.Status, duplicate = true, idempotencyKey });
                    }
                }

                try
                {
                    Spooler.SendRaw(printer.Name, bytes, docName);
                }
                catch (Spooler.SpoolerException ex)
                {
                    if (idempotencyKey is not null) jobs.Complete(idempotencyKey, JobStore.Failed, DateTime.UtcNow, ex.Message);
                    audit.Write("print", origin, printer.Name, idempotencyKey, "spooler_error");
                    return Results.Json(new { error = "print_failed", message = ex.Message }, statusCode: 502);
                }

                if (idempotencyKey is not null) jobs.Complete(idempotencyKey, JobStore.SentToSpooler, DateTime.UtcNow);
                audit.Write("print", origin, printer.Name, idempotencyKey, "sent_to_spooler");
                // "sent_to_spooler" = Windows aceptó los bytes. No confirma impresión física ni corte.
                return Results.Json(new { status = JobStore.SentToSpooler, duplicate = false, idempotencyKey });
            }
            finally
            {
                spoolerGate.Release();
            }
        }

        app.MapGet("/v1/health", () => Results.Json(new
        {
            service = "walinka-print-connector",
            apiVersion = ApiVersion,
            version = AppVersion,
        }));

        app.MapPost("/v1/pair", async (HttpContext ctx) =>
        {
            var now = DateTime.UtcNow;
            var origin = ctx.Request.Headers.Origin.ToString();
            if (!OriginPolicy.IsAllowed(origin, config.AllowedOrigins)) return Deny(403, "origin_not_allowed");
            if (!pairLimiter.TryAcquire(now)) return Deny(429, "rate_limited");

            var body = await ReadBody<PairRequest>(ctx);
            if (body is null || !IsSixDigits(body.Code)) return Deny(400, "invalid_code_format");

            var result = pairing.TryRedeem(body.Code, origin, body.DeviceName ?? "equipo", now, out var token);
            audit.Write("pair", origin, null, null, result.ToString());
            if (result != PairingStore.RedeemResult.Ok)
            {
                return Results.Json(new { error = "pairing_failed", reason = ReasonFor(result) }, statusCode: 401);
            }
            return Results.Json(new { token });
        });

        app.MapGet("/v1/printers", (HttpContext ctx) =>
        {
            var denied = Authorize(ctx);
            if (denied is not null) return denied;
            try
            {
                var list = Spooler.ListPrinters().Select(p => new
                {
                    name = p.Name,
                    isDefault = p.IsDefault,
                    problems = Spooler.DescribeStatus(p.Status),
                }).ToList();
                return Results.Json(new { printers = list });
            }
            catch (Spooler.SpoolerException ex)
            {
                return Results.Json(new { error = "spooler_unavailable", message = ex.Message }, statusCode: 503);
            }
        });

        app.MapPost("/v1/printers/test", async (HttpContext ctx) =>
        {
            var denied = Authorize(ctx);
            if (denied is not null) return denied;
            if (!printLimiter.TryAcquire(DateTime.UtcNow)) return Deny(429, "rate_limited");

            var body = await ReadBody<TestRequest>(ctx);
            var nameError = PayloadPolicy.ValidatePrinterName(body?.PrinterName);
            if (body is null || nameError is not null) return Deny(400, nameError ?? "invalid_body");

            var variant = CutProbe.Find("A")!;
            var bytes = CutProbe.Build(variant, body.PrinterName);
            return await PrintGuardedAsync(body.PrinterName, bytes, "Walinka - prueba de conexión", null, ctx.Request.Headers.Origin.ToString());
        });

        app.MapPost("/v1/print", async (HttpContext ctx) =>
        {
            var denied = Authorize(ctx);
            if (denied is not null) return denied;
            if (!printLimiter.TryAcquire(DateTime.UtcNow)) return Deny(429, "rate_limited");

            var body = await ReadBody<PrintRequest>(ctx);
            if (body is null) return Deny(400, "invalid_body");

            var keyError = PayloadPolicy.ValidateIdempotencyKey(body.IdempotencyKey);
            if (keyError is not null) return Deny(400, keyError);
            var nameError = PayloadPolicy.ValidatePrinterName(body.PrinterName);
            if (nameError is not null) return Deny(400, nameError);
            // Una sola copia por trabajo: un reintento parcial de varias copias duplicaría papel.
            if (body.Copies != 1) return Deny(400, "copies_not_supported");

            byte[] bytes;
            try
            {
                bytes = Convert.FromBase64String(body.DataBase64 ?? string.Empty);
            }
            catch (FormatException)
            {
                return Deny(400, "invalid_payload_encoding");
            }

            var payloadError = PayloadPolicy.ValidatePayload(bytes);
            if (payloadError is not null) return Deny(400, payloadError);

            return await PrintGuardedAsync(body.PrinterName, bytes, "Walinka - ticket", body.IdempotencyKey, ctx.Request.Headers.Origin.ToString());
        });

        app.MapGet("/v1/jobs/{key}", (string key, HttpContext ctx) =>
        {
            var denied = Authorize(ctx);
            if (denied is not null) return denied;
            var record = jobs.Get(key);
            if (record is null) return Deny(404, "job_not_found");
            return Results.Json(new
            {
                key = record.Key,
                status = record.Status,
                printerName = record.PrinterName,
                updatedUtc = record.UpdatedUtc,
                error = record.Error,
            });
        });

        using var stopOnCancel = ct.Register(() => app.Lifetime.StopApplication());
        await app.RunAsync();
    }

    private static IResult Deny(int status, string error)
        => Results.Json(new { error }, statusCode: status);

    private static async Task<T?> ReadBody<T>(HttpContext ctx) where T : class
    {
        try
        {
            return await JsonSerializer.DeserializeAsync<T>(ctx.Request.Body, JsonOptions.Lenient);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static bool IsSixDigits(string? code)
        => code is not null && code.Length == 6 && code.All(char.IsDigit);

    private static string ReasonFor(PairingStore.RedeemResult result) => result switch
    {
        PairingStore.RedeemResult.NoActiveCode => "no_active_code",
        PairingStore.RedeemResult.Expired => "expired",
        PairingStore.RedeemResult.AlreadyUsed => "already_used",
        PairingStore.RedeemResult.TooManyAttempts => "too_many_attempts",
        PairingStore.RedeemResult.InvalidCode => "invalid_code",
        _ => "unknown",
    };
}
