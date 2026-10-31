namespace WalinkaPrintConnector;

/// <summary>Origen exacto de la petición. Nunca comodines ni coincidencias parciales.</summary>
public static class OriginPolicy
{
    public static bool IsAllowed(string? origin, IEnumerable<string> allowedOrigins)
    {
        if (string.IsNullOrWhiteSpace(origin) || origin == "null") return false;
        return allowedOrigins.Any(allowed => string.Equals(allowed, origin, StringComparison.OrdinalIgnoreCase));
    }
}

/// <summary>Protección contra DNS rebinding: el Host debe ser loopback y el puerto correcto.</summary>
public static class HostPolicy
{
    public static bool IsAllowed(string? host, int port)
    {
        if (string.IsNullOrEmpty(host)) return false;
        return string.Equals(host, $"127.0.0.1:{port}", StringComparison.OrdinalIgnoreCase)
            || string.Equals(host, $"localhost:{port}", StringComparison.OrdinalIgnoreCase);
    }
}

public static class Secrets
{
    public static string NewToken()
        => Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');

    public static string NewPairingCode()
        => RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");

    public static string Sha256Hex(string text)
        => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text)));

    public static bool ConstantTimeEquals(string a, string b)
    {
        var x = Encoding.UTF8.GetBytes(a);
        var y = Encoding.UTF8.GetBytes(b);
        return x.Length == y.Length && CryptographicOperations.FixedTimeEquals(x, y);
    }
}

/// <summary>Límite de peticiones por ventana deslizante, en memoria.</summary>
public sealed class SlidingWindowLimiter
{
    private readonly int _max;
    private readonly TimeSpan _window;
    private readonly Queue<DateTime> _hits = new();
    private readonly object _lock = new();

    public SlidingWindowLimiter(int max, TimeSpan window)
    {
        _max = max;
        _window = window;
    }

    public bool TryAcquire(DateTime nowUtc)
    {
        lock (_lock)
        {
            while (_hits.Count > 0 && nowUtc - _hits.Peek() > _window) _hits.Dequeue();
            if (_hits.Count >= _max) return false;
            _hits.Enqueue(nowUtc);
            return true;
        }
    }
}
