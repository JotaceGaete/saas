namespace WalinkaPrintConnector;

/// <summary>
/// Códigos de salida de `serve`. El vigilante los usa para decidir si reintenta.
/// </summary>
public static class ExitCodes
{
    public const int Ok = 0;
    public const int Failure = 1;        // error inesperado: se reintenta con espera creciente
    public const int ConfigInvalid = 2;  // permanente: no se reintenta hasta corregir config.json
    public const int PortBusy = 3;       // transitorio o permanente: se reintenta lento
    public const int AlreadyRunning = 4; // ya hay otro servicio en la sesión: no se reintenta
}
