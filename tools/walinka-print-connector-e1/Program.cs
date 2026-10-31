using System.Text;

namespace WalinkaPrintProbe;

// Prototipo E1 de Walinka Print Connector: impresión RAW, corte y cajón.
// Sin API HTTP, sin emparejamiento, sin ventas, sin boletas.
internal static class Program
{
    private const string Version = "0.1.0-e1";

    private static int Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        if (args.Length == 0 || args[0] is "-h" or "--help") return Help();

        try
        {
            return args[0] switch
            {
                "list" => List(),
                "info" => Info(args),
                "cut-probe" => CutProbeCommand(args),
                "bytes" => WriteTicketBytes(args),
                "test-print" => TestPrint(args),
                "drawer" => Drawer(args),
                "selftest" => SelfTest(),
                "version" => Version2(),
                _ => Fail($"Comando desconocido: {args[0]}. Usa --help."),
            };
        }
        catch (Spooler.SpoolerException ex)
        {
            return Fail(ex.Message);
        }
    }

    private static int Help()
    {
        Console.WriteLine($"""
        Walinka Print Connector — prototipo E1 ({Version})

        Comandos:
          list
              Lista las impresoras instaladas en Windows, con estado y si es la predeterminada.

          test-print --printer "NOMBRE" [--cut modern|legacy|none] [--force]
              Imprime un ticket de PRUEBA de 80 mm con corte. No es una venta.
              --cut: modern = GS V 66 0 (default, mismo que Walinka), legacy = GS V 1, none = sin corte.
              --force: envía aunque Windows reporte la impresora como sin conexión, sin papel o atascada.

          drawer --printer "NOMBRE" --confirm
              Envía el pulso del cajón ESC p. Sin --confirm no hace nada.
              No se llama automáticamente desde test-print.

          info --printer "NOMBRE"
              Muestra driver, puerto, tipo de datos por defecto (RAW/TEXT), procesador de impresión
              y atributos de la cola. Sirve para comparar con el otro computador que sí corta.

          cut-probe --printer "NOMBRE" --variant T|A|B|C|D|E [--force]
              Job mínimo de corte: solo unas líneas y UNA secuencia de corte distinta por variante.
              T = solo texto (sin corte). A = GS V 66 0. B = GS V 66 3. C = GS V 65 0.
              D = GS V 0. E = GS V 1.
              cut-probe --list-variants  muestra las variantes sin imprimir.

          bytes --out ARCHIVO [--cut modern|legacy|full|none]
              Escribe el ticket de prueba como bytes en un archivo, sin imprimir.
              Sirve para revisar la secuencia exacta antes de enviarla.

          selftest
              Verifica las secuencias de bytes sin usar impresora.

          version
        """);
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
        Console.WriteLine();
        Console.WriteLine("Compara este bloque con el computador donde el corte funciona con QZ Tray.");
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
        var variant = CutProbe.Find(code)
            ?? throw new ArgumentException($"Variante desconocida: {code}. Usa --list-variants.");
        var printerName = RequireOption(args, "--printer");
        var force = args.Contains("--force");

        var printer = Spooler.FindPrinter(printerName)
            ?? throw new Spooler.SpoolerException($"No existe una impresora llamada \"{printerName}\". Revisa con 'list'.", 0);

        var problems = Spooler.DescribeStatus(printer.Status);
        if (problems.Count > 0 && !force)
        {
            foreach (var problem in problems) Console.WriteLine($"  - {problem}");
            return Fail("No se envió nada. Revisa la impresora o usa --force.");
        }

        var bytes = CutProbe.Build(variant, printer.Name);
        Spooler.SendRaw(printer.Name, bytes, $"Walinka E1 - cut-probe {variant.Code}");
        Console.WriteLine($"Variante {variant.Code} enviada ({bytes.Length} bytes): {variant.Label}");
        Console.WriteLine("Windows aceptó el trabajo. Confirma visualmente: texto completo, 'V' al inicio sí o no, y corte sí o no.");
        return 0;
    }

    private static int Version2()
    {
        Console.WriteLine(Version);
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
            if (problems.Count == 0)
            {
                Console.WriteLine("    Estado Windows: sin problemas reportados.");
            }
            else
            {
                foreach (var problem in problems) Console.WriteLine($"    Estado Windows: {problem}");
            }
        }
        return 0;
    }

    private static int WriteTicketBytes(string[] args)
    {
        var outPath = RequireOption(args, "--out");
        var cut = ParseCut(GetOption(args, "--cut") ?? "modern");
        var bytes = TicketBuilder.Build(cut, printerLabel: "(sin impresora: solo bytes)");
        File.WriteAllBytes(outPath, bytes);
        Console.WriteLine($"Ticket de prueba escrito en {Path.GetFullPath(outPath)} ({bytes.Length} bytes). No se imprimió nada.");
        return 0;
    }

    private static int TestPrint(string[] args)
    {
        var printerName = RequireOption(args, "--printer");
        var cut = ParseCut(GetOption(args, "--cut") ?? "modern");
        var force = args.Contains("--force");

        var printer = Spooler.FindPrinter(printerName);
        if (printer is null)
        {
            return Fail($"No existe una impresora llamada \"{printerName}\". Revisa el nombre con 'list'.");
        }

        var problems = Spooler.DescribeStatus(printer.Status);
        if (problems.Count > 0 && !force)
        {
            Console.WriteLine($"Windows reporta problemas con \"{printer.Name}\":");
            foreach (var problem in problems) Console.WriteLine($"  - {problem}");
            return Fail("No se envió nada. Revisa la impresora y vuelve a intentar, o usa --force si quieres probar igual.");
        }

        var bytes = TicketBuilder.Build(cut, printer.Name);
        Console.WriteLine($"Enviando ticket de prueba ({bytes.Length} bytes) a \"{printer.Name}\"...");
        Spooler.SendRaw(printer.Name, bytes, "Walinka E1 - prueba sin venta");

        Console.WriteLine();
        Console.WriteLine("Resultado: Windows ACEPTÓ el trabajo en la cola de impresión.");
        Console.WriteLine("Esto NO confirma que el papel se haya impreso ni cortado.");
        Console.WriteLine("Confirma visualmente: ¿salió el ticket completo? ¿Se cortó el papel? ¿Dice PRUEBA sin venta?");
        return 0;
    }

    private static int Drawer(string[] args)
    {
        var printerName = RequireOption(args, "--printer");
        if (!args.Contains("--confirm"))
        {
            Console.WriteLine("No se envió nada. El cajón solo se abre con --confirm.");
            return 0;
        }

        var printer = Spooler.FindPrinter(printerName)
            ?? throw new Spooler.SpoolerException($"No existe una impresora llamada \"{printerName}\".", 0);

        var bytes = EscPos.Concat(EscPos.Init, EscPos.DrawerPulse());
        Spooler.SendRaw(printer.Name, bytes, "Walinka E1 - pulso de cajón");
        Console.WriteLine("Pulso de cajón ESC p enviado a la cola. Verifica si el cajón se abrió.");
        Console.WriteLine("Windows aceptó el trabajo; no confirma la apertura física.");
        return 0;
    }

    private static int SelfTest()
    {
        var failures = new List<string>();

        void Check(bool ok, string name)
        {
            Console.WriteLine($"{(ok ? "OK  " : "FAIL")} {name}");
            if (!ok) failures.Add(name);
        }

        Check(EscPos.CutPartialModern.SequenceEqual(new byte[] { 0x1D, 0x56, 0x42, 0x00 }), "corte modern = GS V 66 0");
        Check(EscPos.CutPartialLegacy.SequenceEqual(new byte[] { 0x1D, 0x56, 0x01 }), "corte legacy = GS V 1");
        Check(EscPos.DrawerPulse().SequenceEqual(new byte[] { 0x1B, 0x70, 0x00, 0x19, 0xFA }), "cajón = ESC p 0 25 250");

        var ticket = TicketBuilder.Build(CutStyle.Modern, "TEST");
        Check(ContainsSequence(ticket, EscPos.CutPartialModern), "ticket con corte modern contiene GS V 66 0");
        Check(!ContainsSequence(ticket, EscPos.DrawerPulse()), "ticket de prueba NO contiene pulso de cajón");
        Check(ticket.Take(2).SequenceEqual(EscPos.Init), "ticket empieza con ESC @ (inicializar)");
        Check(!ContainsSequence(TicketBuilder.Build(CutStyle.None, "TEST"), EscPos.CutPartialModern), "cut none no emite corte");
        Check(!ContainsSequence(ticket, new byte[] { 0x1B, 0x64 }), "ticket NO usa ESC d (ambiguo en modo Star Line)");
        Check(ticket.Take(4).SequenceEqual(new byte[] { 0x1B, 0x40, 0x1B, 0x61 }), "ticket inicia como Walinka: ESC @ + ESC a");
        Check(!CutProbe.Build(CutProbe.Find("T")!, "T").Contains((byte)0x1D), "variante T no contiene GS (sin corte)");
        foreach (var v in CutProbe.Variants)
        {
            var b = CutProbe.Build(v, "TEST");
            var expectsCut = v.Cut is not null;
            Check(expectsCut ? ContainsSequence(b, v.Cut!) : !b.Contains((byte)0x1D), $"variante {v.Code} contiene solo su corte");
            Check(!ContainsSequence(b, new byte[] { 0x1B, 0x70 }), $"variante {v.Code} NO contiene cajón (ESC p)");
        }
        Check(EscPos.CutFullModern.SequenceEqual(new byte[] { 0x1D, 0x56, 0x41, 0x00 }), "corte full moderno = GS V 65 0");
        Check(EscPos.CutFullLegacy.SequenceEqual(new byte[] { 0x1D, 0x56, 0x00 }), "corte full legacy = GS V 0");

        var text = Encoding.ASCII.GetString(EscPos.Text("Ñandú ✓"));
        Check(text == "?and? ?", "texto no ASCII se reemplaza por '?' (Ñandú ✓ -> ?and? ?)");

        Console.WriteLine(failures.Count == 0 ? "Todo OK." : $"{failures.Count} prueba(s) fallaron.");
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

    private static CutStyle ParseCut(string value) => value switch
    {
        "modern" => CutStyle.Modern,
        "legacy" => CutStyle.Legacy,
        "full" => CutStyle.FullModern,
        "none" => CutStyle.None,
        _ => throw new ArgumentException($"--cut inválido: {value}. Usa modern, legacy o none."),
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
