using System.Text;

namespace WalinkaPrintProbe;

/// <summary>
/// Comandos ESC/POS usados por el prototipo E1. Los bytes de corte
/// (GS V 66 0) son los mismos que ya validó físicamente Walinka en
/// src/lib/printing/receipts/escPosCapabilities.js (estrategia gs-v-modern,
/// default de producción). El cajón (ESC p) NO aparece en CUT_STRATEGIES:
/// no está validado en hardware todavía, por eso solo se envía con --confirm.
/// </summary>
public static class EscPos
{
    public static readonly byte[] Init = { 0x1B, 0x40 };          // ESC @
    public static readonly byte[] Lf = { 0x0A };                  // LF

    // Corte parcial modo "Funcion B" (GS V 66 n), n = 0. Igual que gs-v-modern.
    public static readonly byte[] CutPartialModern = { 0x1D, 0x56, 0x42, 0x00 };

    // Corte parcial "Funcion A" legacy (GS V 1). Igual que gs-v-legacy.
    public static readonly byte[] CutPartialLegacy = { 0x1D, 0x56, 0x01 };

    /// <summary>ESC p m t1 t2: pulso al pin m (0 = pin 2) con tiempos t1/t2 en x2 ms.</summary>
    public static byte[] DrawerPulse(byte pin = 0, byte onTime = 25, byte offTime = 250)
        => new byte[] { 0x1B, 0x70, pin, onTime, offTime };

    public static byte[] Feed(byte lines) => new byte[] { 0x1B, 0x64, lines }; // ESC d n

    /// <summary>Texto ASCII. Caracteres fuera de ASCII se reemplazan por '?' para no depender de la tabla de códigos.</summary>
    public static byte[] Text(string text)
    {
        var sb = new StringBuilder(text.Length);
        foreach (var ch in text)
        {
            sb.Append(ch < 128 ? ch : '?');
        }
        return Encoding.ASCII.GetBytes(sb.ToString());
    }

    public static byte[] Line(string text) => Concat(Text(text), Lf);

    public static byte[] Concat(params byte[][] parts)
    {
        var total = parts.Sum(p => p.Length);
        var result = new byte[total];
        var offset = 0;
        foreach (var part in parts)
        {
            Buffer.BlockCopy(part, 0, result, offset, part.Length);
            offset += part.Length;
        }
        return result;
    }
}
