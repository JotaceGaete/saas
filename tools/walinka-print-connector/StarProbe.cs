namespace WalinkaPrintConnector;

/// <summary>
/// Prueba mínima de texto + corte para Star TSP100 Cutter (TSP143) en emulación ESC/POS.
/// Sin logo ni gráficos. Solo cambia la forma de AVANZAR antes del corte (LF repetidos
/// frente a ESC d n) y la forma del corte (GS V 66 0 frente a GS V 65 0). Sirve para
/// saber qué combinación corta en la impresora real. No imprime ventas.
/// </summary>
public static class StarProbe
{
    public sealed record Variant(string Code, string Label, byte[] Feed, byte[]? Cut, string Note);

    public static readonly IReadOnlyList<Variant> Variants = new List<Variant>
    {
        new("S0", "Texto + LF x4, SIN corte (control)", EscPos.LfRepeat(4), null,
            "Línea base. Si aparece una 'V' o basura, el problema está antes del corte."),
        new("S1", "Texto + LF x4 + GS V 66 0 (corte parcial)", EscPos.LfRepeat(4), EscPos.CutPartialModern,
            "Igual que Walinka 'Solo texto' hoy: si no corta aquí, el avance con LF no basta."),
        new("S2", "Texto + ESC d 4 + GS V 66 0 (avance ESC/POS + corte parcial)", EscPos.Feed(4), EscPos.CutPartialModern,
            "Avance explícito con ESC d (emulación ESC/POS de Star). Prueba si el cortador necesita avance propio."),
        new("S3", "Texto + ESC d 4 + GS V 65 0 (avance ESC/POS + corte total)", EscPos.Feed(4), EscPos.CutFullModern,
            "Si S2 no corta pero S3 sí, la cuchilla responde solo al corte total."),
    };

    public static Variant? Find(string code)
        => Variants.FirstOrDefault(v => string.Equals(v.Code, code, StringComparison.OrdinalIgnoreCase));

    public static byte[] Build(Variant variant, string printerLabel)
    {
        var parts = new List<byte[]>
        {
            EscPos.Init,
            EscPos.AlignLeft,
            EscPos.Line($"STAR {variant.Code} - {variant.Label}"),
            EscPos.Line($"Impresora: {printerLabel}"),
            EscPos.Line($"Hora: {DateTime.Now:HH:mm:ss}"),
            EscPos.Line("PRUEBA TEXTO + CORTE - NO ES VENTA"),
            variant.Feed,
        };
        if (variant.Cut is not null) parts.Add(variant.Cut);
        return EscPos.Concat(parts.ToArray());
    }
}
