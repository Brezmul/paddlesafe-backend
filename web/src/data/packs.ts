export type SpotPack = {
  id: string;
  nombre: string;
  descripcion: string;
  spots: Array<{ nombre: string; lat: number; lon: number; seaward_deg: number }>;
};

export const PACKS_SPOTS: SpotPack[] = [
  {
    id: 'costa_blanca_norte',
    nombre: 'Marina Alta (Dénia · Jávea · Moraira)',
    descripcion: 'Calas protegidas, aguas cristalinas y acantilados de la Costa Blanca Norte.',
    spots: [
      { nombre: 'Cala Blanca (Jávea)', lat: 38.7681, lon: 0.2078, seaward_deg: 85 },
      { nombre: 'Cala Granadella (Jávea)', lat: 38.7294, lon: 0.1983, seaward_deg: 125 },
      { nombre: 'Cala del Portitxol (Jávea)', lat: 38.7562, lon: 0.2289, seaward_deg: 90 },
      { nombre: 'Les Rotes (Dénia)', lat: 38.8242, lon: 0.1472, seaward_deg: 60 },
      { nombre: 'El Portet (Moraira)', lat: 38.6881, lon: 0.1389, seaward_deg: 160 }
    ]
  },
  {
    id: 'alicante_campello',
    nombre: 'Alicante · Campello · Tabarca',
    descripcion: 'Playas abiertas, fondos rocosos y travesía insular de referencia.',
    spots: [
      { nombre: 'Coveta Fumà (El Campello)', lat: 38.4411, lon: -0.3603, seaward_deg: 110 },
      { nombre: 'Baños de la Reina (El Campello)', lat: 38.4286, lon: -0.3831, seaward_deg: 120 },
      { nombre: 'Cabo de las Huertas (Alicante)', lat: 38.3569, lon: -0.2167, seaward_deg: 105 },
      { nombre: 'Isla de Tabarca', lat: 38.1656, lon: -0.4736, seaward_deg: 180 }
    ]
  },
  {
    id: 'valencia_gandia',
    nombre: 'Valencia · Cullera · Gandía',
    descripcion: 'Arenales dorados, brisas térmicas y abrigo del cabo de Cullera.',
    spots: [
      { nombre: 'Les Deveses (Oliva/Dénia)', lat: 38.8872, lon: 0.0167, seaward_deg: 65 },
      { nombre: 'Puerto de Gandía', lat: 38.9972, lon: -0.1556, seaward_deg: 90 },
      { nombre: 'Faro de Cullera', lat: 39.1867, lon: -0.2189, seaward_deg: 80 },
      { nombre: 'Malvarrosa (Valencia)', lat: 39.4792, lon: -0.3242, seaward_deg: 85 }
    ]
  },
  {
    id: 'baleares_brava',
    nombre: 'Baleares y Costa Brava',
    descripcion: 'Aguas turquesas y calas del Mediterráneo.',
    spots: [
      { nombre: 'Cap de Formentor (Mallorca)', lat: 39.9272, lon: 3.1367, seaward_deg: 350 },
      { nombre: 'Cala Galdana (Menorca)', lat: 39.9378, lon: 3.9611, seaward_deg: 200 },
      { nombre: 'Aiguablava (Begur, Costa Brava)', lat: 41.9356, lon: 3.2189, seaward_deg: 100 }
    ]
  }
];
