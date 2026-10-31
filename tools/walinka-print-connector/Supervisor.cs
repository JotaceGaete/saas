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

    public static int Run(string dataDir)
    {
        using var watchMutex = Instances.TryAcquire(Instances.WatchMutexName);
        if (watchMutex is null)
        {
            Console.WriteLine("El conector ya está en ejecución en esta sesión.");
            return 4;
        }

        using var stop = Instances.OpenStopEvent(resetFirst: true);
        var log = new ConnectorLog(Path.Combine(dataDir, "logs", "connector.log"));
        var exe = Environment.ProcessPath ?? throw new InvalidOperationException("No se pudo determinar la ruta del ejecutable.");
        log.Write($"Vigilante iniciado (versión {ConnectorServer.AppVersion}).");

        int attempts = 0;
        while (!stop.WaitOne(0))
        {
            var started = DateTime.UtcNow;
            var child = StartServe(exe, dataDir, log);
            if (child is null)
            {
                attempts = NextAttempt(attempts, TimeSpan.Zero);
            }
            else
            {
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

                attempts = NextAttempt(attempts, DateTime.UtcNow - started);
                log.Write($"El servicio terminó inesperadamente (código {code}). Reinicio en {DelayFor(attempts).TotalSeconds:0} s.");
            }

            if (stop.WaitOne(DelayFor(attempts))) break;
        }

        log.Write("Vigilante detenido.");
        return 0;
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
