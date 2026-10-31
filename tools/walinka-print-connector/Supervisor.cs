using System.Diagnostics;

namespace WalinkaPrintConnector;

/// <summary>
/// Vigilante en segundo plano: ejecuta `serve` como proceso hijo sin ventana,
/// lo reinicia si termina inesperadamente y se detiene con la señal de parada.
/// Es lo que arranca Windows al iniciar sesión (entrada HKCU\...\Run).
/// </summary>
internal static class Supervisor
{
    // Esperas entre reinicios consecutivos fallidos. Un proceso que estuvo
    // sano al menos StableRunThreshold reinicia el contador de intentos.
    private static readonly TimeSpan[] Backoff =
    {
        TimeSpan.FromSeconds(1),
        TimeSpan.FromSeconds(2),
        TimeSpan.FromSeconds(5),
        TimeSpan.FromSeconds(10),
        TimeSpan.FromSeconds(30),
    };

    public static readonly TimeSpan StableRunThreshold = TimeSpan.FromMinutes(1);

    public static TimeSpan DelayFor(int failedAttempts)
        => Backoff[Math.Clamp(failedAttempts, 0, Backoff.Length - 1)];

    public static int NextAttempt(int currentAttempts, TimeSpan ranFor)
        => ranFor >= StableRunThreshold ? 0 : currentAttempts + 1;

    // Espera fija cuando no conviene reintentar rápido: configuración inválida,
    // puerto ocupado o servicio ya activo en otro proceso.
    public static readonly TimeSpan SlowRetry = TimeSpan.FromSeconds(30);

    public static int Run(string dataDir)
    {
        using var watchMutex = Instances.TryAcquire(Instances.WatchMutexName);
        if (watchMutex is null)
        {
            Console.WriteLine("El conector ya está en ejecución en esta sesión.");
            return ExitCodes.AlreadyRunning;
        }

        using var stop = Instances.OpenStopEvent(resetFirst: true);
        var log = new ConnectorLog(Path.Combine(dataDir, "logs", "connector.log"));
        var exe = Environment.ProcessPath ?? throw new InvalidOperationException("No se pudo determinar la ruta del ejecutable.");
        log.Write($"Vigilante iniciado (versión {ConnectorServer.AppVersion}).");

        int attempts = 0;
        string? lastProblem = null; // evita repetir el mismo aviso en cada espera
        while (!stop.WaitOne(0))
        {
            // 1) Configuración inválida: no se lanza serve hasta que se corrija.
            var configError = ConnectorConfig.CheckFile(dataDir);
            if (configError is not null)
            {
                Report(log, ref lastProblem, $"Configuración inválida, el servicio no se inicia: {configError}. Corrige config.json; se reintentará solo.");
                if (stop.WaitOne(SlowRetry)) break;
                continue;
            }

            // 2) Lanzar serve y esperar a que termine o llegue la parada.
            var started = DateTime.UtcNow;
            var child = StartServe(exe, dataDir, log);
            if (child is null)
            {
                attempts = NextAttempt(attempts, TimeSpan.Zero);
                if (stop.WaitOne(DelayFor(attempts))) break;
                continue;
            }

            WaitForExitOrStop(child, stop);
            if (!child.HasExited)
            {
                KillTree(child);
                log.Write("Servicio detenido por solicitud.");
                child.Dispose();
                break;
            }

            var code = child.ExitCode;
            child.Dispose();
            if (stop.WaitOne(0)) break;

            // 3) Clasificar la salida: permanente, ya activo, puerto ocupado o caída.
            switch (code)
            {
                case ExitCodes.ConfigInvalid:
                    Report(log, ref lastProblem, "El servicio reportó configuración inválida. Corrige config.json; se reintentará solo.");
                    if (stop.WaitOne(SlowRetry)) return Finish(log);
                    break;

                case ExitCodes.PortBusy:
                    Report(log, ref lastProblem, $"El puerto {ConnectorConfig.DefaultPort} está ocupado. Cierra la aplicación que lo usa; se reintentará cada 30 s.");
                    if (stop.WaitOne(SlowRetry)) return Finish(log);
                    break;

                case ExitCodes.Ok:
                    // Ya hay un servicio sano respondiendo en el puerto: no hace falta reiniciar.
                    Report(log, ref lastProblem, "Ya hay un servicio de Walinka Print Connector respondiendo. Se revisará cada 30 s.");
                    if (stop.WaitOne(SlowRetry)) return Finish(log);
                    break;

                case ExitCodes.AlreadyRunning:
                    Report(log, ref lastProblem, "Otro proceso del conector ya está activo en la sesión.");
                    if (stop.WaitOne(SlowRetry)) return Finish(log);
                    break;

                default:
                    lastProblem = null;
                    attempts = NextAttempt(attempts, DateTime.UtcNow - started);
                    log.Write($"El servicio terminó inesperadamente (código {code}). Reinicio en {DelayFor(attempts).TotalSeconds:0} s.");
                    if (stop.WaitOne(DelayFor(attempts))) return Finish(log);
                    break;
            }
        }

        return Finish(log);
    }

    private static int Finish(ConnectorLog log)
    {
        log.Write("Vigilante detenido.");
        return ExitCodes.Ok;
    }

    // Escribe el aviso una sola vez mientras el problema siga igual.
    private static void Report(ConnectorLog log, ref string? last, string message)
    {
        if (message == last) return;
        last = message;
        log.Write(message);
    }

    private static Process? StartServe(string exe, string dataDir, ConnectorLog log)
    {
        var info = new ProcessStartInfo(exe, $"serve --data-dir \"{dataDir}\"")
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        try
        {
            var process = Process.Start(info);
            if (process is null)
            {
                log.Write("No se pudo iniciar el servicio.");
                return null;
            }
            process.OutputDataReceived += (_, e) => { if (e.Data is not null) log.Write(e.Data); };
            process.ErrorDataReceived += (_, e) => { if (e.Data is not null) log.Write("ERROR: " + e.Data); };
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            return process;
        }
        catch (Exception ex)
        {
            log.Write($"Error al iniciar el servicio: {ex.Message}");
            return null;
        }
    }

    private static void WaitForExitOrStop(Process child, EventWaitHandle stop)
    {
        while (!child.HasExited)
        {
            if (stop.WaitOne(500)) return;
        }
    }

    private static void KillTree(Process child)
    {
        try
        {
            if (!child.HasExited) child.Kill(entireProcessTree: true);
            child.WaitForExit(5000);
        }
        catch (InvalidOperationException)
        {
            // Ya había terminado.
        }
    }
}

/// <summary>Log de texto simple, sin datos de tickets ni tokens. Se recorta si pasa de 2 MB.</summary>
internal sealed class ConnectorLog
{
    private const long MaxBytes = 2 * 1024 * 1024;
    private readonly string _path;
    private readonly object _gate = new();

    public ConnectorLog(string path)
    {
        _path = path;
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
    }

    public void Write(string message)
    {
        lock (_gate)
        {
            try
            {
                if (File.Exists(_path) && new FileInfo(_path).Length > MaxBytes) File.Delete(_path);
                File.AppendAllText(_path, $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} {message}{Environment.NewLine}");
            }
            catch (IOException)
            {
                // El log nunca debe tumbar el servicio.
            }
        }
    }
}
