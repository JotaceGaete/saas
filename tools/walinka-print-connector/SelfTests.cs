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

            // --- Tope de reinicios del vigilante (anti ciclo infinito) ---
            var budget = new SlidingWindowLimiter(2, TimeSpan.FromHours(1));
            Check(!Supervisor.ExhaustedRestartBudget(budget, now) && !Supervisor.ExhaustedRestartBudget(budget, now),
                "dos caídas dentro de la hora todavía se reinician");
            Check(Supervisor.ExhaustedRestartBudget(budget, now), "tercera caída dentro de la hora: el vigilante se rinde");
            Check(!Supervisor.ExhaustedRestartBudget(budget, now.AddHours(2)), "pasada la ventana vuelve a permitir reinicios");
            Check(Supervisor.MaxRestartsPerHour == 10 && Supervisor.NewRestartBudget() is not null, "tope por defecto: 10 reinicios por hora");

            // --- Secretos ---
            Check(Secrets.Sha256Hex("a") == Secrets.Sha256Hex("a") && Secrets.Sha256Hex("a") != Secrets.Sha256Hex("b"), "hash SHA-256 determinista");
            Check(Secrets.ConstantTimeEquals("abc", "abc") && !Secrets.ConstantTimeEquals("abc", "abd"), "comparación en tiempo constante");

            // --- E4.1: validación estructural ESC/POS ---
            byte[] Cat(params object[] items)
            {
                var ms = new MemoryStream();
                foreach (var item in items)
                {
                    switch (item)
                    {
                        case byte b: ms.WriteByte(b); break;
                        case int n: ms.WriteByte((byte)n); break;
                        case string text: ms.Write(System.Text.Encoding.ASCII.GetBytes(text)); break;
                        case byte[] raw: ms.Write(raw); break;
                    }
                }
                return ms.ToArray();
            }
            string? Err(byte[] data) => EscPosStreamValidator.Validate(data).Error;

            var walinkaLike = Cat(0x1B, 0x40, 0x1B, 0x61, 0x01, 0x1B, 0x45, 0x01, 0x1D, 0x21, 0x11, "HOLA", 0x0A,
                0x1D, 0x21, 0x00, 0x1B, 0x45, 0x00, 0x1B, 0x61, 0x00, "Total $1.000", 0x0A, 0x0A, 0x1D, 0x56, 0x42, 0x00);
            Check(Err(walinkaLike) is null, "ticket tipo Walinka (texto, negrita, tamaño, corte) se acepta");
            Check(Err(Cat(0x1B, 0x40, 0x1D, 0x56, 0x42, 0x00)) is null && Err(Cat(0x1B, 0x40, 0x1D, 0x56, 0x41, 0x00)) is null,
                "corte GS V 66 0 y 65 0 se aceptan");
            Check(Err(Cat(0x1B, 0x40, 0x1D, 0x56, 0x00)) is null && Err(Cat(0x1B, 0x40, 0x1D, 0x56, 0x01)) is null,
                "corte legacy GS V 0 y GS V 1 se aceptan");

            var rasterWithDrawerBytes = Cat(0x1B, 0x40, 0x1D, 0x76, 0x30, 0x00, 0x02, 0x00, 0x02, 0x00, 0x1B, 0x70, 0x00, 0xFF);
            Check(Err(rasterWithDrawerBytes) is null, "raster con bytes 1B 70 dentro de los datos se preserva (no es comando)");
            var bitImageWithDrawerBytes = Cat(0x1B, 0x40, 0x1B, 0x2A, 0x00, 0x02, 0x00, 0x1B, 0x70);
            Check(Err(bitImageWithDrawerBytes) is null, "imagen ESC * con 1B 70 en sus columnas se preserva");

            Check(Err(Cat(0x1B, 0x40, 0x1B, 0x70, 0x00, 0x19, 0xFA)) == EscPosStreamValidator.DrawerBlocked,
                "ESC p (cajón) al inicio se rechaza");
            Check(Err(Cat(0x1B, 0x40, "Hola", 0x0A, 0x1B, 0x70, 0x00, 0x19, 0xFA)) == EscPosStreamValidator.DrawerBlocked,
                "ESC p tras texto se rechaza");
            Check(Err(Cat(0x1B, 0x40, 0x1B, 0x61)) == EscPosStreamValidator.Truncated, "ESC a truncado se rechaza");
            Check(Err(Cat(0x1B, 0x40, 0x1D, 0x76, 0x30, 0x00, 0x02, 0x00, 0x04, 0x00, 0x00, 0x00, 0x00)) == EscPosStreamValidator.Truncated,
                "raster con longitud declarada mayor que los datos se rechaza");
            Check(Err(Cat(0x1B, 0x40, 0x1B, 0x2A, 0x00, 0x05, 0x00, 0x01, 0x02)) == EscPosStreamValidator.Truncated,
                "imagen ESC * con columnas declaradas de más se rechaza");
            Check(Err(Cat(0x1B, 0x40, 0x1B, 0x99, 0x00)) == EscPosStreamValidator.UnknownCommand, "ESC desconocido se rechaza");
            Check(Err(Cat(0x1B, 0x40, 0x1B, 0x61, 0x09)) == EscPosStreamValidator.BadParameter, "alineación fuera de rango se rechaza");
            Check(Err(Cat(0x1B, 0x40, 0x10, 0x14, 0x01, 0x00)) == EscPosStreamValidator.ControlNotAllowed, "DLE DC4 (cajón alternativo) se rechaza");
            Check(Err(Cat(0x1B, 0x40, 0x1D, 0x76, 0x31, 0x00, 0x01, 0x00, 0x01, 0x00, 0xFF)) == EscPosStreamValidator.UnknownCommand,
                "subcomando raster distinto de GS v 0 se rechaza");
            Check(PayloadPolicy.ValidatePayload(Cat(0x1B, 0x40, 0x1B, 0x70, 0x00, 0x19, 0xFA)) is not null,
                "payload con ESC p se rechaza en la política de entrada");
            Check(PayloadPolicy.ValidatePayload(Cat(0x1B, 0x40, 0x1B, 0x61, 0x01, "PRUEBA", 0x0A, 0x1D, 0x56, 0x42, 0x00)) is null,
                "payload válido pasa la política de entrada");

            var allProbes = CutProbe.Variants.All(v => Err(CutProbe.Build(v, "Prueba")) is null);
            var allTickets = Enum.GetValues<CutStyle>().All(c => Err(TicketBuilder.Build(c, "Prueba")) is null);
            Check(allProbes, "todas las variantes de prueba de corte del conector pasan la validación");
            var starBytes = StarProbe.Build(StarProbe.Find("S3")!, "Prueba");
            var allStar = StarProbe.Variants.All(v => Err(StarProbe.Build(v, "Prueba")) is null);
            Check(allStar, "todas las variantes star-probe pasan la validación ESC/POS");
            Check(StarProbe.Variants.Select(v => v.Code).Distinct().Count() == StarProbe.Variants.Count, "códigos star-probe únicos");
            Check(starBytes.Take(2).SequenceEqual(EscPos.Init), "star-probe empieza con ESC @");
            Check(ContainsSequence(starBytes, EscPos.Feed(4)) && ContainsSequence(starBytes, EscPos.CutFullModern),
                "star-probe S3 usa ESC d 4 y GS V 65 0");
            Check(StarProbe.Variants.All(v => !ContainsSequence(StarProbe.Build(v, "P"), new byte[] { 0x1B, 0x70 })),
                "star-probe no contiene pulso de cajón (ESC p)");
            Check(StarProbe.Variants.Where(v => v.Cut is null).All(v => !ContainsSequence(StarProbe.Build(v, "P"), new byte[] { 0x1D, 0x56 })),
                "star-probe S0 (control) no envía ningún comando GS V");
            Check(allTickets, "todos los estilos de ticket del conector pasan la validación");

            // --- E4.1: configuración y códigos de salida ---
            var cfgDir = Path.Combine(dir, "cfg-check");
            Directory.CreateDirectory(cfgDir);
            Check(ConnectorConfig.CheckFile(cfgDir) is null && !File.Exists(Path.Combine(cfgDir, "config.json")),
                "config inexistente no es error y no se crea al comprobarla");
            File.WriteAllText(Path.Combine(cfgDir, "config.json"), "{ esto no es json");
            var brokenErr = ConnectorConfig.CheckFile(cfgDir);
            Check(brokenErr is not null && brokenErr.Contains("formato"), "JSON roto: error de formato accionable");
            File.WriteAllText(Path.Combine(cfgDir, "config.json"), "{\"AllowedOrigins\":[\"http://localhost:5173\"]}");
            var devErr = ConnectorConfig.CheckFile(cfgDir);
            Check(devErr is not null && devErr.Contains("AllowLocalDevOrigin"), "localhost sin flag: error que indica el flag");
            Check(File.ReadAllText(Path.Combine(cfgDir, "config.json")).Contains("localhost:5173"),
                "la comprobación no sobrescribe la configuración existente");
            var distinct = new[] { ExitCodes.Ok, ExitCodes.Failure, ExitCodes.ConfigInvalid, ExitCodes.PortBusy, ExitCodes.AlreadyRunning }.Distinct().Count();
            Check(distinct == 5, "códigos de salida distintos para cada caso");

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
