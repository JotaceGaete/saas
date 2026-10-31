namespace WalinkaPrintConnector;

/// <summary>
/// Pruebas unitarias sin dependencias externas. Se ejecutan con: WalinkaPrintConnector.exe selftest
/// No tocan impresoras ni la cola de Windows.
/// </summary>
public static class SelfTests
{
    public static int Run()
    {
        var failures = new List<string>();
        var passed = 0;

        void Check(bool ok, string name)
        {
            Console.WriteLine($"{(ok ? "OK  " : "FAIL")} {name}");
            if (ok) passed++; else failures.Add(name);
        }

        // --- Bytes ESC/POS (mismos que E1) ---
        var ticketA = CutProbe.Build(CutProbe.Find("A")!, "TEST");
        Check(ContainsSequence(ticketA, EscPos.CutPartialModern), "variante A contiene GS V 66 0");
        Check(ticketA.Take(2).SequenceEqual(EscPos.Init), "trabajo empieza con ESC @");
        Check(!ContainsSequence(ticketA, EscPos.DrawerPulse()), "trabajo de corte no contiene pulso de cajón");
        Check(!ContainsSequence(TicketBuilder.Build(CutStyle.Modern, "TEST"), new byte[] { 0x1B, 0x64 }), "ticket no usa ESC d");

        // --- Origen exacto ---
        var allowed = new List<string> { "https://go.ventalink.app", "https://go.walinka.com" };
        Check(OriginPolicy.IsAllowed("https://go.ventalink.app", allowed), "origen exacto permitido");
        Check(OriginPolicy.IsAllowed("HTTPS://GO.VENTALINK.APP", allowed), "origen permitido sin distinguir mayúsculas");
        Check(!OriginPolicy.IsAllowed("https://go.ventalink.app/", allowed), "origen con barra final rechazado");
        Check(!OriginPolicy.IsAllowed("https://go.ventalink.app.evil.com", allowed), "subdominio/sufijo rechazado");
        Check(!OriginPolicy.IsAllowed("http://go.ventalink.app", allowed), "http no permitido para origen de producción");
        Check(!OriginPolicy.IsAllowed(null, allowed), "origen ausente rechazado");
        Check(!OriginPolicy.IsAllowed("null", allowed), "origen 'null' rechazado");

        // --- Host (anti DNS rebinding) ---
        Check(HostPolicy.IsAllowed("127.0.0.1:47801", 47801), "host 127.0.0.1 con puerto correcto");
        Check(HostPolicy.IsAllowed("localhost:47801", 47801), "host localhost con puerto correcto");
        Check(!HostPolicy.IsAllowed("evil.example:47801", 47801), "host externo rechazado");
        Check(!HostPolicy.IsAllowed("127.0.0.1:9999", 47801), "puerto incorrecto rechazado");

        // --- Configuración ---
        var cfg = new ConnectorConfig();
        Check(cfg.Validate() is null, "configuración por defecto válida");
        Check(new ConnectorConfig { AllowedOrigins = new() { "*" } }.Validate() is not null, "comodín en orígenes rechazado");
        Check(new ConnectorConfig { AllowedOrigins = new() { "http://ejemplo.com" } }.Validate() is not null, "http remoto rechazado");
        Check(new ConnectorConfig { AllowedOrigins = new() { "http://localhost:5173" } }.Validate() is not null, "http://localhost rechazado en producción (sin flag de desarrollo)");
        Check(new ConnectorConfig { AllowedOrigins = new() { "https://go.ventalink.app/ruta" } }.Validate() is not null, "origen con ruta rechazado");

        // --- Payload ---
        Check(PayloadPolicy.ValidatePayload(Array.Empty<byte>()) == "payload_empty", "payload vacío rechazado");
        Check(PayloadPolicy.ValidatePayload(new byte[] { 0x41, 0x42 }) == "payload_must_start_with_init", "payload sin ESC @ rechazado");
        Check(PayloadPolicy.ValidatePayload(new byte[] { 0x1B, 0x40, 0x41 }) is null, "payload con ESC @ aceptado");
        Check(PayloadPolicy.ValidatePayload(new byte[PayloadPolicy.MaxDecodedBytes + 1]) == "payload_too_large", "payload sobre el límite rechazado");
        Check(PayloadPolicy.ValidateIdempotencyKey("sale:abc-123:ticket") is null, "clave de idempotencia válida");
        Check(PayloadPolicy.ValidateIdempotencyKey("corta") is not null, "clave demasiado corta rechazada");
        Check(PayloadPolicy.ValidateIdempotencyKey("../../etc/passwd") is not null, "clave con caracteres de ruta rechazada");
        Check(PayloadPolicy.ValidatePrinterName("Xprinter XP-80C") is null, "nombre de impresora válido");
        Check(PayloadPolicy.ValidatePrinterName("Mala\nImpresora") is not null, "nombre con salto de línea rechazado");

        // --- Emparejamiento y tokens (directorio temporal) ---
        var dir = Path.Combine(Path.GetTempPath(), "wpc-selftest-" + Guid.NewGuid().ToString("N"));
        try
        {
            var pairing = new PairingStore(dir);
            var now = DateTime.UtcNow;

            var code = pairing.StartPairing(now);
            Check(code.Length == 6 && code.All(char.IsDigit), "código de emparejamiento de 6 dígitos");
            var malformed = pairing.TryRedeem("000000x", "https://go.ventalink.app", "PC", now, out var malformedToken);
            Check(malformed == PairingStore.RedeemResult.InvalidCode && malformedToken is null,
                "código con formato inválido no emparejado");

            var fresh = new PairingStore(Path.Combine(dir, "wrong"));
            var wrongCode = fresh.StartPairing(now);
            var attempt = wrongCode == "000000" ? "111111" : "000000";
            Check(fresh.TryRedeem(attempt, "https://go.ventalink.app", "PC", now, out _) == PairingStore.RedeemResult.InvalidCode, "código incorrecto: InvalidCode");

            var exhausted = new PairingStore(Path.Combine(dir, "exhausted"));
            var exCode = exhausted.StartPairing(now);
            var badCode = exCode == "000000" ? "111111" : "000000";
            for (var i = 0; i < PairingStore.MaxAttempts; i++) exhausted.TryRedeem(badCode, "https://go.ventalink.app", "PC", now, out _);
            Check(exhausted.TryRedeem(exCode, "https://go.ventalink.app", "PC", now, out _) == PairingStore.RedeemResult.TooManyAttempts,
                "tras 5 intentos fallidos el código queda bloqueado");

            var expired = new PairingStore(Path.Combine(dir, "expired"));
            var expCode = expired.StartPairing(now);
            Check(expired.TryRedeem(expCode, "https://go.ventalink.app", "PC", now.AddMinutes(6), out _) == PairingStore.RedeemResult.Expired,
                "código vencido a los 6 minutos");

            var ok = pairing.TryRedeem(code, "https://go.ventalink.app", "Caja 1", now, out var token);
            Check(ok == PairingStore.RedeemResult.Ok && !string.IsNullOrEmpty(token), "código correcto emite token");
            Check(token is not null && token.Length >= 40, "token de al menos 40 caracteres");
            Check(pairing.TryRedeem(code, "https://go.ventalink.app", "Caja 1", now, out _) == PairingStore.RedeemResult.AlreadyUsed, "código usado no se reutiliza");
            Check(pairing.Authenticate(token!, "https://go.ventalink.app"), "token válido para su origen");
            Check(!pairing.Authenticate(token!, "https://go.walinka.com"), "token rechazado en otro origen");
            Check(!pairing.Authenticate("token-falso", "https://go.ventalink.app"), "token falso rechazado");
            Check(!pairing.Authenticate("", "https://go.ventalink.app"), "token vacío rechazado");
            Check(pairing.Revoke() >= 1 && !pairing.Authenticate(token!, "https://go.ventalink.app"), "revocar invalida tokens");

            // --- Trabajos idempotentes ---
            var jobs = new JobStore(Path.Combine(dir, "jobs"));
            var key = "sale:test-1:ticket";
            Check(jobs.Begin(key, "Xprinter", now, out _) == JobStore.BeginOutcome.Started, "primer envío inicia el trabajo");
            Check(jobs.Begin(key, "Xprinter", now, out _) == JobStore.BeginOutcome.Duplicate, "doble envío mientras imprime: duplicado");
            jobs.Complete(key, JobStore.SentToSpooler, now);
            Check(jobs.Begin(key, "Xprinter", now, out _) == JobStore.BeginOutcome.Duplicate, "trabajo ya enviado: no se reimprime");
            var key2 = "sale:test-2:ticket";
            jobs.Begin(key2, "Xprinter", now, out _);
            jobs.Complete(key2, JobStore.Failed, now, "error de cola");
            Check(jobs.Begin(key2, "Xprinter", now, out _) == JobStore.BeginOutcome.Started, "trabajo fallido puede reintentarse con la misma clave");
            Check(jobs.Get(key)?.Status == JobStore.SentToSpooler, "estado persistido y consultable");
            var reopened = new JobStore(Path.Combine(dir, "jobs"));
            Check(reopened.Begin(key, "Xprinter", now, out _) == JobStore.BeginOutcome.Duplicate, "tras reinicio el trabajo enviado sigue siendo duplicado");

            // --- Límite de peticiones ---
            var limiter = new SlidingWindowLimiter(3, TimeSpan.FromMinutes(1));
            Check(limiter.TryAcquire(now) && limiter.TryAcquire(now) && limiter.TryAcquire(now), "limitador deja pasar 3 peticiones");
            Check(!limiter.TryAcquire(now), "cuarta petición en la ventana rechazada");
            Check(limiter.TryAcquire(now.AddMinutes(2)), "tras la ventana se vuelve a permitir");

            // --- Secretos ---
            Check(Secrets.Sha256Hex("a") == Secrets.Sha256Hex("a") && Secrets.Sha256Hex("a") != Secrets.Sha256Hex("b"), "hash SHA-256 determinista");
            Check(Secrets.ConstantTimeEquals("abc", "abc") && !Secrets.ConstantTimeEquals("abc", "abd"), "comparación en tiempo constante");

            // --- E4: orígenes de producción ---
            var prodCfg = new ConnectorConfig();
            Check(prodCfg.Validate() is null && !prodCfg.AllowedOrigins.Any(o => o.Contains("localhost")),
                "configuración por defecto solo tiene orígenes de producción");
            var devWithoutFlag = new ConnectorConfig { AllowedOrigins = new() { "http://localhost:5173" } };
            Check(devWithoutFlag.Validate() is not null, "localhost rechazado sin AllowLocalDevOrigin");
            var devWithFlag = new ConnectorConfig { AllowLocalDevOrigin = true, AllowedOrigins = new() { "http://localhost:5173" } };
            Check(devWithFlag.Validate() is null, "localhost aceptado solo con AllowLocalDevOrigin");

            // --- E4: vigilante y reinicios ---
            Check(Supervisor.DelayFor(0) == TimeSpan.FromSeconds(1) && Supervisor.DelayFor(99) == TimeSpan.FromSeconds(30),
                "espera de reinicio crece y se limita a 30 s");
            Check(Supervisor.NextAttempt(3, TimeSpan.FromSeconds(5)) == 4, "reinicio rápido incrementa el contador");
            Check(Supervisor.NextAttempt(3, TimeSpan.FromMinutes(5)) == 0, "un proceso estable reinicia el contador");
            Check(Instances.ServeMutexName != Instances.WatchMutexName && Instances.StopEventName.StartsWith("Local\\", StringComparison.Ordinal),
                "nombres de instancia y parada en el espacio Local (sin administrador)");
        }
        finally
        {
            try { Directory.Delete(dir, recursive: true); } catch (IOException) { }
        }

        Console.WriteLine();
        Console.WriteLine(failures.Count == 0 ? $"Todo OK ({passed} pruebas)." : $"{failures.Count} prueba(s) fallaron de {passed + failures.Count}.");
        return failures.Count == 0 ? 0 : 1;
    }

    private static bool ContainsSequence(byte[] data, byte[] seq)
    {
        for (var i = 0; i + seq.Length <= data.Length; i++)
        {
            if (data.AsSpan(i, seq.Length).SequenceEqual(seq)) return true;
        }
        return false;
    }
}
