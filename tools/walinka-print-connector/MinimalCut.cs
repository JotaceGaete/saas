namespace WalinkaPrintConnector;

/// <summary>
/// Trabajo mínimo: una línea de texto, un solo LF de avance y el corte elegido.
/// Sirve para comprobar corte automático sin gastar papel. No es un ticket de venta.
/// </summary>
public static class MinimalCut
{
    public const int FeedLines = 1;

    public static byte[] Build(CutStyle cut, string printerLabel)
    {
        var parts = new List<byte[]>
        {
            EscPos.Init,
            EscPos.AlignLeft,
            EscPos.Line($"WALINKA CORTE MINIMO - {printerLabel}"),
            EscPos.LfRepeat(FeedLines),
        };
        switch (cut)
        {
            case CutStyle.Modern: parts.Add(EscPos.CutPartialModern); break;
            case CutStyle.Legacy: parts.Add(EscPos.CutPartialLegacy); break;
            case CutStyle.FullModern: parts.Add(EscPos.CutFullModern); break;
            case CutStyle.None: break;
        }
        return EscPos.Concat(parts.ToArray());
    }
}
