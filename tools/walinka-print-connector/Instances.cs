namespace WalinkaPrintConnector;

/// <summary>
/// Instancia única y señal de parada, usando objetos con nombre en el
/// espacio "Local\" de la sesión del usuario: no requieren administrador.
/// </summary>
internal static class Instances
{
    public const string ServeMutexName = @"Local\WalinkaPrintConnector.Serve";
    public const string WatchMutexName = @"Local\WalinkaPrintConnector.Watch";
    public const string StopEventName = @"Local\WalinkaPrintConnector.Stop";

    /// <summary>Devuelve el mutex si esta sesión lo adquiere; null si ya lo tiene otro proceso.</summary>
    public static Mutex? TryAcquire(string name)
    {
        try
        {
            var mutex = new Mutex(initiallyOwned: true, name, out bool createdNew);
            if (createdNew) return mutex;
            mutex.Dispose();
            return null;
        }
        catch (UnauthorizedAccessException)
        {
            return null;
        }
        catch (PlatformNotSupportedException)
        {
            // Solo fuera de Windows: sin exclusión entre procesos.
            return new Mutex(initiallyOwned: true);
        }
    }

    /// <summary>True si otro proceso mantiene el mutex en este momento.</summary>
    public static bool IsHeld(string name)
    {
        var mutex = TryAcquire(name);
        if (mutex is null) return true;
        mutex.ReleaseMutex();
        mutex.Dispose();
        return false;
    }

    /// <summary>Evento de parada, con reinicio explícito al empezar cada ejecución.</summary>
    public static EventWaitHandle OpenStopEvent(bool resetFirst)
    {
        EventWaitHandle handle;
        try
        {
            handle = new EventWaitHandle(false, EventResetMode.ManualReset, StopEventName);
        }
        catch (PlatformNotSupportedException)
        {
            // Solo fuera de Windows (pruebas en Linux): sin señal entre procesos.
            handle = new ManualResetEvent(false);
        }
        if (resetFirst) handle.Reset();
        return handle;
    }

    /// <summary>Pide la parada del conector y de su vigilante. Devuelve false si no hay nada corriendo.</summary>
    public static bool RequestStop()
    {
        if (!IsHeld(WatchMutexName) && !IsHeld(ServeMutexName)) return false;
        using var handle = OpenStopEvent(resetFirst: false);
        handle.Set();
        return true;
    }
}
