export const INTERIOR_PRESENCE_ITEMS = Object.freeze({
  hasDocument: 'Documento do veículo',
  hasChildSeat: 'Cadeirinha infantil',
  hasEToll: 'Tag de pedágio',
});

export const INSPECTION_ACCESSORIES = Object.freeze({
  spareTire: 'Estepe',
  warningTriangle: 'Triângulo',
  wheelWrench: 'Chave de Roda',
  wheelLockKey: 'Chave Segredo',
  jack: 'Macaco',
  repairKit: 'Kit Reparo',
  hubcap: 'Tampão',
});

export const ACCESSORY_STATUS_LABELS = Object.freeze({
  'not-equipped': 'Não possui',
  unverified: 'Possui, presença não informada',
  present: 'Presente',
  missing: 'Ausente',
});

export function compareInteriorItems(inspection, delivery) {
  const changes = [
    delivery.hasDocument !== inspection.hasDocument &&
      (inspection.hasDocument ? 'Documento devolvido' : 'Documento ausente'),
    delivery.hasChildSeat !== inspection.hasChildSeat &&
      (inspection.hasChildSeat ? 'Cadeirinha devolvida' : 'Cadeirinha ausente'),
    delivery.hasEToll !== inspection.hasEToll &&
      (inspection.hasEToll ? 'Tag presente' : 'Tag ausente'),
  ].filter(Boolean);
  const notCompared = [];

  for (const [id, name] of Object.entries(INSPECTION_ACCESSORIES)) {
    const before = delivery.accessoryStates?.[id];
    const after = inspection.accessoryStates?.[id];
    const ownershipChanged = (before === 'not-equipped') !== (after === 'not-equipped');
    const presenceUnverified = before === 'unverified' || after === 'unverified';
    if (!before || !after || (!ownershipChanged && presenceUnverified)) {
      notCompared.push(name);
    } else if (before !== after) {
      changes.push(`${name} · ${ACCESSORY_STATUS_LABELS[before]} → ${ACCESSORY_STATUS_LABELS[after]}`);
    }
  }

  return { changes, notCompared };
}
