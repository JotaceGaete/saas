/**
 * Mapa de keywords/alias por slug de rubro.
 * Permite que el buscador de RubroPrincipalSelector matchee términos
 * coloquiales aunque el nombre formal del rubro sea distinto.
 *
 * Claves: slug del rubro (tal como viene de wa_rubros.slug).
 * Valores: array de strings en minúsculas, sin acentos, sin espacios dobles.
 *
 * Criterio de inclusión: términos que un usuario real usaría para buscar
 * ese rubro en lugar de (o además de) su nombre formal.
 */
export const RUBRO_KEYWORDS = {
  'comida-y-bebidas': [
    'gastronomia', 'comida', 'restaurant', 'restaurante', 'bar', 'pub',
    'cerveceria', 'cafeteria', 'pizzeria', 'hamburguesas', 'sushi',
    'delivery', 'almuerzos', 'colaciones', 'comida rapida', 'sandwicheria',
    'rotiseria', 'fuente de soda', 'parrilla', 'asados', 'picadas',
    'take away', 'takeaway',
  ],
  'botilleria': [
    'botilleria', 'alcohol', 'licores', 'cerveza', 'vinos', 'whisky',
    'ron', 'vodka', 'tragos', 'copete', 'bebestibles', 'licoreria',
  ],
  'verduleria': [
    'verduras', 'frutas', 'feria', 'vegetales', 'hortalizas', 'verduleria',
    'fruteria', 'organicos', 'abarrotes',
  ],
  'carniceria': [
    'carne', 'pollo', 'vacuno', 'cerdo', 'embutidos', 'parrilla',
    'carniceria', 'fiambres', 'cecinas', 'chorizo',
  ],
  'panaderia': [
    'pan', 'pasteles', 'tortas', 'dulces', 'reposteria', 'queques',
    'masas', 'panaderia', 'pasteleria', 'bizcochos', 'galletas',
    'empanadas', 'facturas', 'marraquetas',
  ],
  'cafeteria': [
    'cafe', 'te', 'desayunos', 'brunch', 'cafeteria', 'infusiones',
    'capuccino', 'expreso', 'espresso', 'desayuno',
  ],
  'farmacia': [
    'farmacia', 'remedios', 'medicamentos', 'perfumeria', 'perfumes',
    'cuidado personal', 'drogueria', 'salud', 'vitaminas', 'suplementos',
    'cosmeticos', 'maquillaje',
  ],
  'ferreteria': [
    'herramientas', 'construccion', 'tornillos', 'pintura', 'materiales',
    'ferreteria', 'plomeria', 'electricidad', 'pernos', 'griferia',
  ],
  'libreria': [
    'cuadernos', 'utiles', 'lapices', 'papeleria', 'oficina', 'escolar',
    'libreria', 'papeles', 'carpetas', 'mochilas', 'plastilina',
  ],
  'ropa': [
    'ropa', 'vestuario', 'poleras', 'pantalones', 'moda', 'boutique',
    'prendas', 'blusas', 'vestidos', 'chaquetas', 'abrigos', 'jeans',
    'indumentaria', 'telas',
  ],
  'calzado': [
    'zapatos', 'zapatillas', 'botas', 'sandalias', 'calzado',
    'tenis', 'deportivos', 'alpargatas', 'mocasines',
  ],
  'mascotas': [
    'mascotas', 'petshop', 'perros', 'gatos', 'alimento mascota',
    'veterinaria', 'pet shop', 'accesorios mascotas', 'jaulas',
    'arena gato', 'huesos perro',
  ],
  'electronica': [
    'tecnologia', 'celulares', 'accesorios', 'computacion', 'cables',
    'audio', 'electronica', 'smartphones', 'tablets', 'parlantes',
    'audifonos', 'cargadores', 'fundas',
  ],
  'muebleria': [
    'muebles', 'hogar', 'decoracion', 'living', 'dormitorio', 'cocina',
    'muebleria', 'estantes', 'sillas', 'mesas', 'camas', 'sofas',
    'alfombras', 'cortinas',
  ],
  'flores': [
    'floreria', 'flores', 'plantas', 'vivero', 'jardin', 'ramos',
    'bouquets', 'coronas', 'arreglos florales', 'macetas', 'cactus',
    'suculentas',
  ],
  'joyeria': [
    'joyas', 'accesorios', 'anillos', 'collares', 'pulseras',
    'bisuteria', 'aretes', 'aros', 'cadenas', 'relojes', 'joyeria',
  ],
  'funeraria': [
    'funeraria', 'funeral', 'velorio', 'ataud', 'sepelio',
    'cremacion', 'servicios funerarios',
  ],
  'repuestos': [
    'repuestos', 'auto', 'automotriz', 'vehiculo', 'motor', 'aceite',
    'bateria', 'autopartes', 'frenos', 'lubricantes', 'llantas',
    'neumáticos', 'neumaticos',
  ],
  'artesanias': [
    'artesanias', 'manualidades', 'hecho a mano', 'regalos', 'souvenirs',
    'artesano', 'ceramica', 'tejidos', 'bordados', 'madera',
  ],
  'ventas-varias': [
    'de todo', 'varios', 'surtido', 'bazar', 'miscelanea', 'multiuso',
    'multitienda', 'todo tipo', 'variado',
  ],
};
