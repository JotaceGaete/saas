using System.Net.Http;
namespace WalinkaPrintConnector;

// Walinka Print Connector — versión 0.3 (E4: instalador, vigilante, instancia única).
// Servicio local en 127.0.0.1 con emparejamiento por código y token.
// Sin apertura de cajón: ningún endpoint ni comando lo ejecuta en esta versión.
internal static class Program
{
    private const string Version = ConnectorServer.AppVersion;

    private static async Task<int> Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        if (args.Length == 0 || args[0] is "-h" or "--help") return Help();

        try
        {
            var dataDir = GetOption(args, "--data-dir")
                ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "WalinkaPrintConnector");

            switch (args[0])
            {
                case "serve":
                    return await Serve(dataDir);
                case "watch":
                    return Supervisor.Run(dataDir);
                case "stop":
                    return Stop();
                case "restart":
                    return Restart(dataDir);
                case "pair":
                    return Pair(dataDir);
                case "unpair":
                    return Unpair(dataDir);
                case "status":
                    return Status(dataDir);
                case "config":
                    return ShowConfig(dataDir);
                case "list":
                    return List();
                case "info":
                    return Info(args);
                case "test-print":
                    return TestPrint(args);
                case "cut-probe":
                    return CutProbeCommand(args);
                case "bytes":
                    return WriteTicketBytes(args);
                case "selftest":
                    return SelfTests.Run();
                case "version":
                    Console.WriteLine(Version);
                    return 0;
                default:
                    return Fail($"Comando desconocido: {args[0]}. Usa --help.");
            }
        }
        catch (Spooler.SpoolerException ex)
        {
            return Fail(ex.Message);
        }
        catch (Exception ex) when (ex is InvalidDataException or ArgumentException)
        {
            return Fail(ex.Message);
        }
    }

    private static int Help()
    {
        Console.WriteLine($"""
        Walinka Print Connector {Version}

        Servicio:
          serve [--data-dir RUTA]
              Inicia el servicio en 127.0.0.1:{ConnectorConfig.DefaultPort} (puerto en config.json).
              Déjalo corriendo mientras uses Walinka.

          watch [--data-dir RUTA]
              Vigilante en segundo plano: ejecuta serve y lo reinicia si se cae.
              Es lo que se inicia con Windows. Una sola instancia por sesión.

          stop
              Detiene el vigilante y el servicio.

          restart
              Detiene y vuelve a iniciar el vigilante.

          pair [--data-dir RUTA]
              Genera un código de 6 dígitos válido 5 minutos. Escríbelo en Walinka > Configuración de impresión.
              Un código ya usado o vencido no sirve; genera uno nuevo.

          unpair [--data-dir RUTA]
              Revoca todos los equipos emparejados.

          status [--data-dir RUTA]
              Muestra cuántos equipos están emparejados y dónde están los archivos.

          config [--data-dir RUTA]
              Muestra la configuración (orígenes permitidos y puerto).

        Impresoras (diagnóstico local):
          list
          info --printer "NOMBRE"
          test-print --printer "NOMBRE" [--cut modern|legacy|full|none] [--force]
          cut-probe --printer "NOMBRE" --variant T|A|B|C|D|E [--force]
          cut-probe --list-variants
          bytes --out ARCHIVO [--cut modern|legacy|full|none]

        Pruebas:
          selftest
          version
        """);
        return 0;
    }

    private static async Task<int> Serve(string dataDir)
    {
        var config = ConnectorConfig.LoadOrCreate(dataDir);

        using var serveMutex = Instances.TryAcquire(Instances.ServeMutexName);
        if (serveMutex is null)
        {
            Console.WriteLine("El conector ya está en ejecución en esta sesión.");
            return 4;
        }

        if (!PortIsFree(config.Port))
        {
            if (await IsOurServiceAsync(config.Port))
            {
                Console.WriteLine($"Walinka Print Connector ya responde en 127.0.0.1:{config.Port}.");
                return 0;
            }
            Console.WriteLine($"El puerto {config.Port} está ocupado por otra aplicación.");
            Console.WriteLine("Cierra esa aplicación o cambia el puerto en config.json y reinicia el conector.");
            return 3;
        }

        // Un `serve` manual limpia una parada pendiente; si lo arrancó el
        // vigilante, el vigilante es quien reinicia la señal.
        using var stopEvent = Instances.OpenStopEvent(resetFirst: !Instances.IsHeld(Instances.WatchMutexName));
        using var cts = new CancellationTokenSource();
        Console.CancelKeyPress += (_, e) =>
        {
            e.Cancel = true;
            cts.Cancel();
        };
        _ = Task.Run(() =>
        {
            stopEvent.WaitOne();
            cts.Cancel();
        });

        Console.WriteLine($"Walinka Print Connector {Version} escuchando en 127.0.0.1:{config.Port}.");
        Console.WriteLine($"Orígenes permitidos: {string.Join(", ", config.AllowedOrigins)}");
        Console.WriteLine($"Datos: {dataDir}");
        Console.WriteLine("Ctrl+C para detener.");
        try
        {
            await ConnectorServer.RunAsync(dataDir, config, cts.Token);
        }
        catch (OperationCanceledException)
        {
            // Salida normal: Ctrl+C o señal de parada.
        }
        catch (IOException ex) when (ex.InnerException is System.Net.Sockets.SocketException { SocketErrorCode: System.Net.Sockets.SocketError.AddressAlreadyInUse })
        {
            Console.WriteLine($"El puerto {config.Port} se ocupó justo al iniciar. Reinicia el conector.");
            return 3;
        }
        return 0;
    }

    private static bool PortIsFree(int port)
    {
        try
        {
            var listener = new System.Net.Sockets.TcpListener(System.Net.IPAddress.Loopback, port);
            listener.Start();
            listener.Stop();
            return true;
        }
        catch (System.Net.Sockets.SocketException)
        {
            return false;
        }
    }

    private static async Task<bool> IsOurServiceAsync(int port)
    {
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
            var json = await http.GetStringAsync($"http://127.0.0.1:{port}/v1/health");
            return json.Contains("walinka-print-connector", StringComparison.Ordinal);
        }
        catch (Exception)
        {
            return false;
        }
    }

    private static int Stop()
    {
        if (!Instances.RequestStop())
        {
            Console.WriteLine("El conector no está en ejecución.");
            return 0;
        }
        Console.WriteLine("Solicitud de parada enviada.");
        var deadline = DateTime.UtcNow.AddSeconds(15);
        while (DateTime.UtcNow < deadline)
        {
            if (!Instances.IsHeld(Instances.WatchMutexName) && !Instances.IsHeld(Instances.ServeMutexName))
            {
                Console.WriteLine("Conector detenido.");
                return 0;
            }
            Thread.Sleep(300);
        }
        Console.WriteLine("El conector no terminó a tiempo. Revisa el log en %LOCALAPPDATA%\\WalinkaPrintConnector\\logs.");
        return 1;
    }

    private static int Restart(string dataDir)
    {
        Stop();
        var exe = Environment.ProcessPath ?? throw new InvalidOperationException("No se pudo determinar la ruta del ejecutable.");
        // Mismo arranque que el registro de inicio: sin ventana de consola.
        var info = new System.Diagnostics.ProcessStartInfo(
            Path.Combine(Environment.SystemDirectory, "conhost.exe"),
            $"--headless \"{exe}\" watch --data-dir \"{dataDir}\"")
        {
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        System.Diagnostics.Process.Start(info);
        Console.WriteLine("Conector iniciado de nuevo.");
        return 0;
    }

    private static int Pair(string dataDir)
    {
        var config = ConnectorConfig.LoadOrCreate(dataDir);
        var store = new PairingStore(dataDir);
        var code = store.StartPairing(DateTime.UtcNow);
        Console.WriteLine();
        Console.WriteLine($"  Código de emparejamiento: {code}");
        Console.WriteLine($"  Válido {PairingStore.CodeValidMinutes} minutos, un solo uso.");
        Console.WriteLine("  Escríbelo en Walinka > Configuración de impresión > Conector local.");
        Console.WriteLine($"  El servicio debe estar corriendo (serve) en el puerto {config.Port}.");
        Console.WriteLine();
        return 0;
    }

    private static int Unpair(string dataDir)
    {
        var store = new PairingStore(dataDir);
        var count = store.Revoke();
        Console.WriteLine($"Equipos revocados: {count}. Tendrán que emparejarse de nuevo.");
        return 0;
    }

    private static int Status(string dataDir)
    {
        var config = ConnectorConfig.LoadOrCreate(dataDir);
        var store = new PairingStore(dataDir);
        Console.WriteLine($"Puerto:               {config.Port}");
        Console.WriteLine($"Equipos emparejados:  {store.PairedDeviceCount()}");
        Console.WriteLine($"Carpeta de datos:     {dataDir}");
        Console.WriteLine("Registro de auditoría: audit.log (sin tokens ni tickets)");
        return 0;
    }

    private static int ShowConfig(string dataDir)
    {
        var config = ConnectorConfig.LoadOrCreate(dataDir);
        Console.WriteLine(Path.Combine(dataDir, "config.json"));
        Console.WriteLine(JsonSerializer.Serialize(config, JsonOptions.Pretty));
        return 0;
    }

    private static int List()
    {
        var printers = Spooler.ListPrinters();
        if (printers.Count == 0)
        {
            Console.WriteLine("No hay impresoras instaladas en Windows.");
            return 0;
        }

        foreach (var p in printers)
        {
            var defaultMark = p.IsDefault ? " [predeterminada]" : string.Empty;
            Console.WriteLine($"- {p.Name}{defaultMark}");
            Console.WriteLine($"    Puerto: {p.Port} | Driver: {p.Driver} | Trabajos en cola: {p.Jobs}");
            var problems = Spooler.DescribeStatus(p.Status);
            Console.WriteLine(problems.Count == 0
                ? "    Estado Windows: sin problemas reportados."
                : "    Estado Windows: " + string.Join(" ", problems));
        }
        return 0;
    }

    private static int Info(string[] args)
    {
        var name = RequireOption(args, "--printer");
        var d = Spooler.GetDetails(name);
        if (d is null) return Fail($"No existe una impresora llamada \"{name}\". Revisa con 'list'.");

        Console.WriteLine($"Impresora:        {d.Name}{(d.IsDefault ? " [predeterminada]" : string.Empty)}");
        Console.WriteLine($"Driver:           {d.Driver}");
        Console.WriteLine($"Puerto:           {d.Port}");
        Console.WriteLine($"Tipo de datos:    {(d.DefaultDatatype.Length == 0 ? "(vacío)" : d.DefaultDatatype)}");
        Console.WriteLine($"Procesador:       {(d.PrintProcessor.Length == 0 ? "(vacío)" : d.PrintProcessor)}");
        Console.WriteLine($"Servidor:         {(d.ServerName.Length == 0 ? "(local)" : d.ServerName)}");
        Console.WriteLine($"Atributos:        0x{d.Attributes:X}");
        Console.WriteLine($"Trabajos en cola: {d.Jobs}");
        var problems = Spooler.DescribeStatus(d.Status);
        Console.WriteLine(problems.Count == 0 ? "Estado Windows:    sin problemas reportados" : "Estado Windows:    " + string.Join(" ", problems));
        return 0;
    }

    private static int TestPrint(string[] args)
    {
        var printerName = RequireOption(args, "--printer");
        var cut = ParseCut(GetOption(args, "--cut") ?? "modern");
        var force = args.Contains("--force");

        var printer = Spooler.FindPrinter(printerName);
        if (printer is null) return Fail($"No existe una impresora llamada \"{printerName}\". Revisa con 'list'.");

        var problems = Spooler.DescribeStatus(printer.Status);
        if (problems.Count > 0 && !force)
        {
            foreach (var problem in problems) Console.WriteLine($"  - {problem}");
            return Fail("No se envió nada. Revisa la impresora o usa --force.");
        }

        var bytes = TicketBuilder.Build(cut, printer.Name);
        Spooler.SendRaw(printer.Name, bytes, "Walinka - prueba (sin venta)");
        Console.WriteLine("Windows ACEPTÓ el trabajo. No confirma impresión física ni corte.");
        return 0;
    }

    private static int CutProbeCommand(string[] args)
    {
        if (args.Contains("--list-variants"))
        {
            foreach (var v in CutProbe.Variants) Console.WriteLine($"{v.Code}: {v.Label}\n    {v.Note}");
            return 0;
        }

        var code = RequireOption(args, "--variant");
        var variant = CutProbe.Find(code) ?? throw new ArgumentException($"Variante desconocida: {code}. Usa --list-variants.");
        var printerName = RequireOption(args, "--printer");
        var force = args.Contains("--force");

        var printer = Spooler.FindPrinter(printerName)
            ?? throw new ArgumentException($"No existe una impresora llamada \"{printerName}\".");
        var problems = Spooler.DescribeStatus(printer.Status);
        if (problems.Count > 0 && !force)
        {
            foreach (var problem in problems) Console.WriteLine($"  - {problem}");
            return Fail("No se envió nada. Revisa la impresora o usa --force.");
        }

        Spooler.SendRaw(printer.Name, CutProbe.Build(variant, printer.Name), $"Walinka - cut-probe {variant.Code}");
        Console.WriteLine($"Variante {variant.Code} enviada. Windows aceptó el trabajo; confirma visualmente el corte.");
        return 0;
    }

    private static int WriteTicketBytes(string[] args)
    {
        var outPath = RequireOption(args, "--out");
        var cut = ParseCut(GetOption(args, "--cut") ?? "modern");
        var bytes = TicketBuilder.Build(cut, "(solo bytes)");
        File.WriteAllBytes(outPath, bytes);
        Console.WriteLine($"Escrito {Path.GetFullPath(outPath)} ({bytes.Length} bytes). No se imprimió nada.");
        return 0;
    }

    private static CutStyle ParseCut(string value) => value switch
    {
        "modern" => CutStyle.Modern,
        "legacy" => CutStyle.Legacy,
        "full" => CutStyle.FullModern,
        "none" => CutStyle.None,
        _ => throw new ArgumentException($"--cut inválido: {value}. Usa modern, legacy, full o none."),
    };

    private static string RequireOption(string[] args, string name)
        => GetOption(args, name) ?? throw new ArgumentException($"Falta la opción {name}. Usa --help.");

    private static string? GetOption(string[] args, string name)
    {
        for (var i = 0; i < args.Length - 1; i++)
        {
            if (args[i] == name) return args[i + 1];
        }
        return null;
    }

    private static int Fail(string message)
    {
        Console.Error.WriteLine($"ERROR: {message}");
        return 1;
    }
}
