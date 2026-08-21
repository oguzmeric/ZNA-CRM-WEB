// Seri no giriş temizliği — mobil stokKalemiService.seriNormalize ile AYNI kural.
// Excel/pano yapıştırmalarında satıra karışan zero-width (U+200B..U+200D),
// BOM (U+FEFF) ve NBSP (U+00A0) karakterleri DB'ye girerse telefonun
// tam-eşleşme araması SN'i bulamaz ("webden eklenen görünmüyor" ailesi).
// Tire/iç karakterlere DOKUNULMAZ — üretici SN formatı meşrudur; okuma
// tarafındaki tolerans mig 321 stok_sn_ara ile sağlanır.
export const seriNormalize = (s) =>
  String(s ?? '').replace(/[​-‍﻿ ]/g, '').trim()
