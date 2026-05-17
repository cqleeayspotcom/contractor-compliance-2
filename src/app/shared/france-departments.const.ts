export interface RegionDef {
  code: string;
  name: string;
  departments: string[];
}

export const ALL_DEPARTMENTS: readonly string[] = [
  '01','02','03','04','05','06','07','08','09','10',
  '11','12','13','14','15','16','17','18','19',
  '21','22','23','24','25','26','27','28','29',
  '2A','2B',
  '30','31','32','33','34','35','36','37','38','39',
  '40','41','42','43','44','45','46','47','48','49','50',
  '51','52','53','54','55','56','57','58','59','60',
  '61','62','63','64','65','66','67','68','69','70',
  '71','72','73','74','75','76','77','78','79','80',
  '81','82','83','84','85','86','87','88','89','90',
  '91','92','93','94','95',
  '971','972','973','974','976',
] as const;

export const REGIONS: readonly RegionDef[] = [
  { code: '11', name: 'Île-de-France',         departments: ['75','77','78','91','92','93','94','95'] },
  { code: '24', name: 'Centre-Val de Loire',    departments: ['18','28','36','37','41','45'] },
  { code: '27', name: 'Bourgogne-Franche-Comté', departments: ['21','25','39','58','70','71','89','90'] },
  { code: '28', name: 'Normandie',              departments: ['14','27','50','61','76'] },
  { code: '32', name: 'Hauts-de-France',        departments: ['02','59','60','62','80'] },
  { code: '44', name: 'Grand Est',              departments: ['08','10','51','52','54','55','57','67','68','88'] },
  { code: '52', name: 'Pays de la Loire',       departments: ['44','49','53','72','85'] },
  { code: '53', name: 'Bretagne',               departments: ['22','29','35','56'] },
  { code: '75', name: 'Nouvelle-Aquitaine',     departments: ['16','17','19','23','24','33','40','47','64','79','86','87'] },
  { code: '76', name: 'Occitanie',              departments: ['09','11','12','30','31','32','34','46','48','65','66','81','82'] },
  { code: '84', name: 'Auvergne-Rhône-Alpes',   departments: ['01','03','07','15','26','38','42','43','63','69','73','74'] },
  { code: '93', name: "Provence-Alpes-Côte d'Azur", departments: ['04','05','06','13','83','84'] },
  { code: '94', name: 'Corse',                  departments: ['2A','2B'] },
];

// Display names for UI labels. Full mapping of all 101 departments.
export const DEPARTMENT_NAMES: Record<string, string> = {
  '01': 'Ain', '02': 'Aisne', '03': 'Allier', '04': 'Alpes-de-Haute-Provence', '05': 'Hautes-Alpes',
  '06': 'Alpes-Maritimes', '07': 'Ardèche', '08': 'Ardennes', '09': 'Ariège', '10': 'Aube',
  '11': 'Aude', '12': 'Aveyron', '13': 'Bouches-du-Rhône', '14': 'Calvados', '15': 'Cantal',
  '16': 'Charente', '17': 'Charente-Maritime', '18': 'Cher', '19': 'Corrèze',
  '21': "Côte-d'Or", '22': "Côtes-d'Armor", '23': 'Creuse', '24': 'Dordogne', '25': 'Doubs',
  '26': 'Drôme', '27': 'Eure', '28': 'Eure-et-Loir', '29': 'Finistère',
  '2A': 'Corse-du-Sud', '2B': 'Haute-Corse',
  '30': 'Gard', '31': 'Haute-Garonne', '32': 'Gers', '33': 'Gironde', '34': 'Hérault',
  '35': 'Ille-et-Vilaine', '36': 'Indre', '37': 'Indre-et-Loire', '38': 'Isère', '39': 'Jura',
  '40': 'Landes', '41': 'Loir-et-Cher', '42': 'Loire', '43': 'Haute-Loire', '44': 'Loire-Atlantique',
  '45': 'Loiret', '46': 'Lot', '47': 'Lot-et-Garonne', '48': 'Lozère', '49': 'Maine-et-Loire',
  '50': 'Manche', '51': 'Marne', '52': 'Haute-Marne', '53': 'Mayenne', '54': 'Meurthe-et-Moselle',
  '55': 'Meuse', '56': 'Morbihan', '57': 'Moselle', '58': 'Nièvre', '59': 'Nord',
  '60': 'Oise', '61': 'Orne', '62': 'Pas-de-Calais', '63': 'Puy-de-Dôme', '64': 'Pyrénées-Atlantiques',
  '65': 'Hautes-Pyrénées', '66': 'Pyrénées-Orientales', '67': 'Bas-Rhin', '68': 'Haut-Rhin', '69': 'Rhône',
  '70': 'Haute-Saône', '71': 'Saône-et-Loire', '72': 'Sarthe', '73': 'Savoie', '74': 'Haute-Savoie',
  '75': 'Paris', '76': 'Seine-Maritime', '77': 'Seine-et-Marne', '78': 'Yvelines', '79': 'Deux-Sèvres',
  '80': 'Somme', '81': 'Tarn', '82': 'Tarn-et-Garonne', '83': 'Var', '84': 'Vaucluse',
  '85': 'Vendée', '86': 'Vienne', '87': 'Haute-Vienne', '88': 'Vosges', '89': 'Yonne', '90': 'Territoire de Belfort',
  '91': 'Essonne', '92': 'Hauts-de-Seine', '93': 'Seine-Saint-Denis', '94': 'Val-de-Marne', '95': "Val-d'Oise",
  '971': 'Guadeloupe', '972': 'Martinique', '973': 'Guyane', '974': 'La Réunion', '976': 'Mayotte',
};

export function regionForDepartment(code: string): string | null {
  return REGIONS.find(r => r.departments.includes(code))?.code ?? null;
}
