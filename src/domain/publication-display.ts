// Label dictionary ported from Arsip SeputarJaminanUI.tsx, not new enums/validation.
export const attributeLabels: Record<string, string> = {
  land_area_m2:"Luas tanah (m²)",contour:"Kontur tanah",road_access:"Akses jalan",
  building_area_m2:"Luas bangunan (m²)",floor_count:"Jumlah lantai",public_usage:"Fungsi bangunan",
  brand_or_manufacturer:"Merek atau produsen",brand:"Merek",model_or_type:"Model atau tipe",
  manufacture_year:"Tahun pembuatan",public_capacity:"Kapasitas umum",transmission:"Transmisi",
  fuel_type:"Bahan bakar",mileage_km:"Jarak tempuh (km)",public_condition:"Kondisi aset",
};
export const vocabularyLabels: Record<string, string> = {
  SANGAT_BAIK:"Sangat baik",BAIK:"Baik",CUKUP:"Cukup",PERLU_PERBAIKAN:"Perlu perbaikan",
  DATAR:"Datar",MIRING:"Miring",BERKONTUR:"Berkontur",RODA_DUA:"Roda dua",MOBIL:"Mobil",TRUK:"Truk",
  HUNIAN:"Hunian",KOMERSIAL:"Komersial",PERKANTORAN:"Perkantoran",PERGUDANGAN:"Pergudangan",
  INDUSTRI:"Industri",SERBAGUNA:"Serbaguna",MANUAL:"Manual",OTOMATIS:"Otomatis",
  BENSIN:"Bensin",DIESEL:"Diesel",LISTRIK:"Listrik",HIBRIDA:"Hibrida",GAS:"Gas",
};
export function publicationAttributeValue(value: unknown): unknown {
  return typeof value === "string" ? vocabularyLabels[value] ?? value : value;
}
