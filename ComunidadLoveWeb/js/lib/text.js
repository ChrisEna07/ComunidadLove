/* ==========================================================================
   FILTRO DE PALABRAS OBSENAS E INAPROPIADAS
   (Costeño / Colombiano, Español e Inglés)
   ========================================================================== */

const PALABRAS_OBSCENAS = [
  // Costeño / Colombiano (Cartagena, Barranquilla, Santa Marta, etc.)
  'mamon', 'mamón', 'mamones', 'mamonazo', 'mamonazos', 'hijo de puta', 'hijos de puta', 'hijoeputa', 'hijoeputas', 'hijueputa', 'hijueputas', 'hpta', 'hptas', 'gonorrea', 'gonorreas',
  'malparido', 'malparida', 'malparidos', 'malparidas', 'carechimba', 'carechimbas', 'chimba', 'chimbas', 'monda', 'mondá', 'mondas', 'mondás', 'marica', 'maricas', 'maricon',
  'maricón', 'maricones', 'pirobo', 'pirobos', 'culero', 'culeros', 'culera', 'culeras', 'careverga', 'carevergas', 'verga', 'vergas', 'mierda', 'mierdas', 'mierdero', 'puta', 'putas', 'puto', 'putos',
  'cacorro', 'cacorros', 'tripleputa', 'tripleputas', 'cabron', 'cabrón', 'cabrones', 'hijuemadre', 'hijuemadres', 'jijuemadre', 'caremonda', 'caremondá', 'caremondas',
  'culipronta', 'culipronto', 'sipote', 'petardo', 'corroncho', 'corronchos', 'cascorro', 'careculo', 'careculos',
  // Español general y otros departamentos
  'pendejo', 'pendeja', 'pendejos', 'pendejas', 'pendejada', 'pendejadas', 'joder', 'pingo', 'boludo', 'boludos', 'pelotudo', 'pelotudos', 'gil', 'giles', 'concha', 'conchas',
  'conchudo', 'conchudos', 'culiao', 'culiaos', 'hijo de perra', 'hijos de perra', 'maraco', 'chucha', 'mamaguevo', 'mamagüevo', 'mamaguevos', 'guevon', 'guevones',
  'güevón', 'güevones', 'guevón', 'weon', 'weones', 'huevon', 'huevones', 'huevón', 'culito', 'teta', 'tetas', 'panocha', 'bollo', 'guaricha', 'perra', 'perras', 'zorra', 'zorras',
  'maldito', 'maldita', 'malditos', 'malditas', 'estupido', 'estupida', 'estúpido', 'estúpida', 'estupidos', 'idiota', 'idiotas', 'imbecil', 'imbécil', 'imbeciles',
  // Inglés
  'fuck', 'fucks', 'fucking', 'fucked', 'shit', 'shits', 'asshole', 'assholes', 'bitch', 'bitches', 'cunt', 'cunts', 'dick', 'dicks', 'bastard', 'bastards', 'motherfucker', 'motherfuckers',
  'whore', 'whores', 'piss', 'crap', 'wanker', 'bollocks', 'pussy', 'pussies'
];

/**
 * Retorna true si el texto contiene palabras obscenas o lenguaje inapropiado.
 */
export function contienePalabrasObscenas(texto) {
  if (!texto) return false;

  const textoNormalizado = String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const textoLeet = textoNormalizado
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/8/g, 'b')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's');

  for (let i = 0; i < PALABRAS_OBSCENAS.length; i++) {
    const palabra = PALABRAS_OBSCENAS[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (palabra.includes(' ')) {
      if (textoNormalizado.includes(palabra) || textoLeet.includes(palabra)) return true;
    } else {
      const regex = new RegExp(`\\b${palabra}\\b`, 'i');
      if (regex.test(textoNormalizado) || regex.test(textoLeet)) return true;
    }
  }

  return false;
}
