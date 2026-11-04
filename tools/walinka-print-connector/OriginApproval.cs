using System.Runtime.InteropServices;
using System.Text.Json.Nodes;

namespace WalinkaPrintConnector;

/// <summary>
/// Previews de Vercel que el usuario puede aprobar desde Windows. Solo el
/// proyecto «saas» del equipo de Walinka: un sitio cualquiera no puede ni
/// siquiera hacer aparecer la ventana de confirmación.
/// Forma: https://saas-&lt;rama-o-hash&gt;-juan-s-projects-afd7e18e.vercel.app
/// </summary>
public static class PreviewOrigins
{
    public const string HostPrefix = "saas-";
    public const string HostSuffix = "-juan-s-projects-afd7e18e.vercel.app";
    private const string Scheme = "https://";

    public static bool IsApprovable(string? origin)
    {
        if (string.IsNullOrEmpty(origin) || origin.Length > 120) return false;
        if (!origin.StartsWith(Scheme, StringComparison.Ordinal)) return false;
        var host = origin[Scheme.Length..];
        if (!host.StartsWith(HostPrefix, StringComparison.Ordinal) || !host.EndsWith(HostSuffix, StringComparison.Ordinal)) return false;
        if (host.Length <= HostPrefix.Length + HostSuffix.Length) return false;

        // La parte variable es un trozo de una sola etiqueta DNS: sin puntos,
        // puertos, rutas ni mayúsculas.
        var middle = host[HostPrefix.Length..^HostSuffix.Length];
        if (middle[0] == '-' || middle[^1] == '-') return false;
        if (!middle.All(c => c is (>= 'a' and <= 'z') or (>= '0' and <= '9') or '-')) return false;

        var firstLabel = host[..host.IndexOf('.')];
        return firstLabel.Length <= 63;
    }
}

/// <summary>
/// Edita config.json agregando un origen sin perder nada de lo que ya tiene:
/// se modifica solo la lista AllowedOrigins y se conservan las demás claves.
/// </summary>
public static class ConfigFile
{
    /// <returns>null si quedó guardado; si no, el motivo (y config.json no se toca).</returns>
    public static string? AddAllowedOrigin(string dataDir, string origin, out List<string> allowedOrigins)
    {
        allowedOrigins = new List<string>();
        Directory.CreateDirectory(dataDir);
        var path = Path.Combine(dataDir, "config.json");

        JsonObject root;
        try
        {
            root = File.Exists(path)
                ? JsonNode.Parse(File.ReadAllText(path)) as JsonObject ?? throw new JsonException("no es un objeto JSON")
                : JsonSerializer.SerializeToNode(new ConnectorConfig()) as JsonObject ?? new JsonObject();
        }
        catch (JsonException)
        {
            return "config.json tiene un error de formato; no se modificó.";
        }
        catch (IOException ex)
        {
            return $"no se pudo leer config.json: {ex.Message}";
        }

        if (root["AllowedOrigins"] is not JsonArray origins)
        {
            // Sin la clave, el conector usaba los orígenes de fábrica: se escriben
            // explícitamente para no perderlos al agregar el nuevo.
            origins = new JsonArray();
            foreach (var o in new ConnectorConfig().AllowedOrigins) origins.Add(JsonValue.Create(o));
            root["AllowedOrigins"] = origins;
        }

        var exists = origins.Any(n => n is JsonValue v && v.TryGetValue<string>(out var s)
            && string.Equals(s, origin, StringComparison.OrdinalIgnoreCase));
        if (!exists) origins.Add(JsonValue.Create(origin));

        var text = root.ToJsonString(JsonOptions.Pretty);
        ConnectorConfig? candidate;
        try
        {
            candidate = JsonSerializer.Deserialize<ConnectorConfig>(text);
        }
        catch (JsonException)
        {
            return "config.json tiene valores con un tipo inesperado; no se modificó.";
        }
        if (candidate is null) return "config.json quedaría vacío; no se modificó.";
        var error = candidate.Validate();
        if (error is not null) return error;

        try
        {
            if (File.Exists(path)) File.Copy(path, path + ".bak", overwrite: true);
            var tmp = path + ".tmp";
            File.WriteAllText(tmp, text, new UTF8Encoding(false));
            File.Move(tmp, path, overwrite: true);
        }
        catch (IOException ex)
        {
            return $"no se pudo guardar config.json: {ex.Message}";
        }
        catch (UnauthorizedAccessException ex)
        {
            return $"no se pudo guardar config.json: {ex.Message}";
        }

        allowedOrigins = candidate.AllowedOrigins;
        return null;
    }
}

public enum PromptAnswer { Approved, Denied, TimedOut }

/// <summary>Ventanas que ve el usuario en Windows. Interfaz para poder probar sin escritorio.</summary>
public interface IApprovalPrompt
{
    PromptAnswer AskApproveOrigin(string origin);
    void ShowPairingCode(string origin, string code);
    void ShowError(string message);
}

/// <summary>
/// Confirmación explícita en Windows con un MessageBox nativo, siempre encima
/// y con «No» como botón por defecto: un Enter accidental no autoriza nada.
/// </summary>
public sealed class WindowsApprovalPrompt : IApprovalPrompt
{
    public const int AskTimeoutSeconds = 120;
    private const string Title = "Walinka Print Connector";

    private const uint MB_OK = 0x0;
    private const uint MB_YESNO = 0x4;
    private const uint MB_ICONERROR = 0x10;
    private const uint MB_ICONWARNING = 0x30;
    private const uint MB_ICONINFORMATION = 0x40;
    private const uint MB_DEFBUTTON2 = 0x100;
    private const uint MB_SYSTEMMODAL = 0x1000;
    private const uint MB_SETFOREGROUND = 0x10000;
    private const uint MB_TOPMOST = 0x40000;
    private const int IDYES = 6;
    private const int MB_TIMEDOUT = 32000;

    // Exportada por user32 desde Windows XP; igual a MessageBoxW pero con plazo.
    [DllImport("user32.dll", EntryPoint = "MessageBoxTimeoutW", CharSet = CharSet.Unicode)]
    private static extern int MessageBoxTimeout(IntPtr hWnd, string text, string caption, uint type, ushort languageId, uint milliseconds);

    private static int Show(string text, uint flags, int timeoutSeconds)
        => MessageBoxTimeout(IntPtr.Zero, text, Title, flags | MB_SYSTEMMODAL | MB_SETFOREGROUND | MB_TOPMOST, 0, (uint)timeoutSeconds * 1000);

    public PromptAnswer AskApproveOrigin(string origin)
    {
        var text =
            "Un sitio web pide usar las impresoras de este equipo:\n\n" +
            $"    {origin}\n\n" +
            "Es una versión de prueba (Preview) de Walinka.\n" +
            "Autorízalo solo si acabas de pulsar «Autorizar este sitio» en Walinka.\n\n" +
            "¿Autorizar este sitio?\n\n" +
            $"(Si no respondes en {AskTimeoutSeconds / 60} minutos, no se autoriza.)";
        var result = Show(text, MB_YESNO | MB_ICONWARNING | MB_DEFBUTTON2, AskTimeoutSeconds);
        return result switch
        {
            IDYES => PromptAnswer.Approved,
            MB_TIMEDOUT => PromptAnswer.TimedOut,
            _ => PromptAnswer.Denied,
        };
    }

    public void ShowPairingCode(string origin, string code)
    {
        var text =
            "Sitio autorizado:\n" +
            $"    {origin}\n\n" +
            $"Código de emparejamiento:   {code}\n\n" +
            $"Escríbelo en Walinka y pulsa «Emparejar». Vale {PairingStore.CodeValidMinutes} minutos y sirve una sola vez.";
        Show(text, MB_OK | MB_ICONINFORMATION, PairingStore.CodeValidMinutes * 60);
    }

    public void ShowError(string message)
        => Show($"No se pudo autorizar el sitio.\n\n{message}", MB_OK | MB_ICONERROR, 120);
}

/// <summary>
/// Solicitudes de autorización de un origen nuevo. Una ventana a la vez, como
/// mucho 5 por hora, y un «No» silencia ese origen 10 minutos.
/// </summary>
public sealed class OriginApprovalService
{
    public enum Outcome { AlreadyAllowed, NotApprovable, Disabled, Pending, Busy, RecentlyDenied, RateLimited }

    public static readonly TimeSpan DenyCooldown = TimeSpan.FromMinutes(10);
    public const int MaxPromptsPerHour = 5;

    private readonly string _dataDir;
    private readonly ConnectorConfig _config;
    private readonly IApprovalPrompt _prompt;
    private readonly PairingStore _pairing;
    private readonly Audit _audit;
    private readonly Action<Action> _runInBackground;
    private readonly SlidingWindowLimiter _promptLimiter = new(MaxPromptsPerHour, TimeSpan.FromHours(1));
    private readonly Dictionary<string, DateTime> _deniedUntil = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _lock = new();
    private bool _busy;

    public OriginApprovalService(string dataDir, ConnectorConfig config, IApprovalPrompt prompt, PairingStore pairing, Audit audit, Action<Action>? runInBackground = null)
    {
        _dataDir = dataDir;
        _config = config;
        _prompt = prompt;
        _pairing = pairing;
        _audit = audit;
        _runInBackground = runInBackground ?? (work => new Thread(() => work()) { IsBackground = true, Name = "origin-approval" }.Start());
    }

    public static string CodeFor(Outcome outcome) => outcome switch
    {
        Outcome.AlreadyAllowed => "already_allowed",
        Outcome.NotApprovable => "origin_not_approvable",
        Outcome.Disabled => "approval_disabled",
        Outcome.Pending => "pending_confirmation",
        Outcome.Busy => "confirmation_in_progress",
        Outcome.RecentlyDenied => "recently_denied",
        Outcome.RateLimited => "rate_limited",
        _ => "unknown",
    };

    public Outcome Request(string? origin, DateTime nowUtc)
    {
        if (OriginPolicy.IsAllowed(origin, _config.AllowedOrigins)) return Outcome.AlreadyAllowed;
        if (!_config.AllowPreviewApproval) return Outcome.Disabled;
        if (!PreviewOrigins.IsApprovable(origin)) return Outcome.NotApprovable;

        var exact = origin!;
        lock (_lock)
        {
            if (_busy) return Outcome.Busy;
            if (_deniedUntil.TryGetValue(exact, out var until) && nowUtc < until) return Outcome.RecentlyDenied;
            if (!_promptLimiter.TryAcquire(nowUtc)) return Outcome.RateLimited;
            _busy = true;
        }

        TryAudit(exact, "asked");
        try
        {
            _runInBackground(() => Decide(exact));
        }
        catch (Exception)
        {
            lock (_lock) _busy = false;
            throw;
        }
        return Outcome.Pending;
    }

    private void Decide(string origin)
    {
        string? code = null;
        try
        {
            var answer = _prompt.AskApproveOrigin(origin);
            if (answer != PromptAnswer.Approved)
            {
                // Sin respuesta (nadie frente al equipo) no penaliza; un «No» explícito sí.
                if (answer == PromptAnswer.Denied)
                {
                    lock (_lock) _deniedUntil[origin] = DateTime.UtcNow + DenyCooldown;
                }
                _audit.Write("origin_approval", origin, null, null, answer == PromptAnswer.Denied ? "denied" : "timed_out");
                return;
            }

            var error = ConfigFile.AddAllowedOrigin(_dataDir, origin, out var updated);
            if (error is not null)
            {
                _audit.Write("origin_approval", origin, null, null, "save_failed");
                _prompt.ShowError(error);
                return;
            }

            // Lista nueva (no se modifica la que leen otras peticiones en curso).
            _config.AllowedOrigins = updated;
            _audit.Write("origin_approval", origin, null, null, "approved");
            code = _pairing.StartPairing(DateTime.UtcNow);
        }
        catch (Exception ex)
        {
            // Hilo en segundo plano: una excepción sin capturar cerraría el servicio.
            TryAudit(origin, "error:" + ex.GetType().Name);
        }
        finally
        {
            lock (_lock) _busy = false;
        }

        if (code is null) return;
        try
        {
            _prompt.ShowPairingCode(origin, code);
        }
        catch (Exception ex)
        {
            TryAudit(origin, "pairing_dialog_error:" + ex.GetType().Name);
        }
    }

    private void TryAudit(string origin, string result)
    {
        try
        {
            _audit.Write("origin_approval", origin, null, null, result);
        }
        catch (Exception)
        {
            // Sin log no hay a dónde informar; el servicio sigue funcionando.
        }
    }
}
