const singleGroup = (id, name, options, { required = true } = {}) => ({
  id,
  name,
  required,
  selectionType: 'single',
  minSelections: required ? 1 : 0,
  maxSelections: 1,
  options,
});

const multiGroup = (id, name, options, { required = false, minSelections = required ? 1 : 0, maxSelections = options.length } = {}) => ({
  id,
  name,
  required,
  selectionType: 'multi',
  minSelections,
  maxSelections,
  options,
});

const choice = (id, name, priceAdjustment = 0) => ({ id, name, priceAdjustment });

const portionGroup = (largePrice = 400) => singleGroup('portion-size', 'Portion Size', [
  choice('regular', 'Regular'),
  choice('large', 'Large', largePrice),
]);

const heatGroup = singleGroup('heat-level', 'Heat Level', [
  choice('mild', 'Mild'),
  choice('medium', 'Medium'),
  choice('hot', 'Hot'),
]);

const swallowGroups = [
  singleGroup('swallow-type', 'Swallow Type', [
    choice('eba', 'Eba'),
    choice('pounded-yam', 'Pounded Yam'),
    choice('amala', 'Amala'),
    choice('semovita', 'Semovita'),
  ]),
  portionGroup(400),
  multiGroup('extras', 'Extras', [
    choice('extra-soup', 'Extra Soup', 450),
    choice('extra-meat', 'Extra Meat', 350),
    choice('extra-fish', 'Extra Fish', 450),
  ], { maxSelections: 3 }),
];

export const catalog = {
  'fried-plantain': {
    name: 'Fried Plantain',
    unitAmount: 1000,
    optionGroups: [
      portionGroup(400),
      multiGroup('extras', 'Extras', [choice('pepper-sauce', 'Pepper Sauce', 150), choice('moi-moi', 'Moi Moi', 350)], { maxSelections: 2 }),
    ],
  },
  'delife-yamarita': {
    name: 'DeLife Yamarita',
    unitAmount: 1200,
    optionGroups: [
      portionGroup(400),
      multiGroup('dips', 'Choose Your Dips', [choice('pepper-sauce', 'Pepper Sauce', 150), choice('garlic-mayo', 'Garlic Mayo', 100)], { maxSelections: 2 }),
    ],
  },
  'egusi-soup': { name: 'Egusi Soup', unitAmount: 1500, optionGroups: swallowGroups },
  'fish-peppersoup': {
    name: 'Fish Peppersoup',
    unitAmount: 700,
    optionGroups: [portionGroup(300), heatGroup, multiGroup('extras', 'Extras', [choice('extra-fish', 'Extra Fish', 400), choice('extra-broth', 'Extra Broth', 250)], { maxSelections: 2 })],
  },
  'fried-rice': {
    name: 'Fried Rice',
    unitAmount: 1800,
    optionGroups: [portionGroup(500), heatGroup, multiGroup('extras', 'Extras', [choice('fried-plantain', 'Fried Plantain', 300), choice('moi-moi', 'Moi Moi', 350), choice('extra-chicken', 'Extra Chicken', 400)], { maxSelections: 2 })],
  },
  'jollof-rice-chicken': {
    name: 'Jollof Rice & Chicken',
    unitAmount: 2000,
    optionGroups: [portionGroup(500), heatGroup, multiGroup('extras', 'Extras', [choice('fried-plantain', 'Fried Plantain', 300), choice('moi-moi', 'Moi Moi', 350), choice('extra-chicken', 'Extra Chicken', 400)], { maxSelections: 2 })],
  },
  'jollof-rice': {
    name: 'Jollof Rice',
    unitAmount: 1200,
    optionGroups: [portionGroup(450), heatGroup, multiGroup('add-protein', 'Add Protein', [choice('chicken', 'Chicken', 400), choice('turkey', 'Turkey', 450), choice('fish', 'Fish', 500)], { maxSelections: 2 })],
  },
  'meat-pie': {
    name: 'Meat Pie',
    unitAmount: 1500,
    optionGroups: [singleGroup('pack-size', 'Pack Size', [choice('single', 'Single'), choice('two-pack', 'Two Pack', 1000)]), multiGroup('extras', 'Extras', [choice('pepper-sauce', 'Pepper Sauce', 150)], { maxSelections: 1 })],
  },
  'moi-moi': {
    name: 'Moi Moi',
    unitAmount: 700,
    optionGroups: [portionGroup(300), multiGroup('extras', 'Extras', [choice('egg', 'Boiled Egg', 150), choice('fish', 'Fish', 250), choice('pepper-sauce', 'Pepper Sauce', 150)], { maxSelections: 2 })],
  },
  nkwobi: {
    name: 'Nkwobi',
    unitAmount: 1500,
    optionGroups: [portionGroup(500), heatGroup, multiGroup('extras', 'Extras', [choice('extra-meat', 'Extra Meat', 450), choice('onions', 'Extra Onions', 50)], { maxSelections: 2 })],
  },
  'nsala-soup': { name: 'Nsala Soup', unitAmount: 1300, optionGroups: swallowGroups },
  'okra-soup': { name: 'Okra Soup', unitAmount: 1700, optionGroups: swallowGroups },
  'stewed-chicken': {
    name: 'Stewed Chicken',
    unitAmount: 1400,
    optionGroups: [singleGroup('portion-size', 'Portion Size', [choice('two-pieces', 'Two Pieces'), choice('three-pieces', 'Three Pieces', 400)]), heatGroup, multiGroup('extras', 'Extras', [choice('extra-stew', 'Extra Stew', 200), choice('fried-plantain', 'Fried Plantain', 300)], { maxSelections: 2 })],
  },
  'stewed-turkey': {
    name: 'Stewed Turkey',
    unitAmount: 1300,
    optionGroups: [singleGroup('portion-size', 'Portion Size', [choice('two-pieces', 'Two Pieces'), choice('three-pieces', 'Three Pieces', 400)]), heatGroup, multiGroup('extras', 'Extras', [choice('extra-stew', 'Extra Stew', 200), choice('fried-plantain', 'Fried Plantain', 300)], { maxSelections: 2 })],
  },
  'stewed-turkey-2': {
    name: 'Stewed Turkey',
    unitAmount: 1300,
    optionGroups: [singleGroup('portion-size', 'Portion Size', [choice('two-pieces', 'Two Pieces'), choice('three-pieces', 'Three Pieces', 400)]), heatGroup, multiGroup('extras', 'Extras', [choice('extra-stew', 'Extra Stew', 200), choice('fried-plantain', 'Fried Plantain', 300)], { maxSelections: 2 })],
  },
  'tilapia-fish': {
    name: 'Tilapia Fish',
    unitAmount: 3300,
    optionGroups: [singleGroup('side', 'Choose Your Side', [choice('fried-plantain', 'Fried Plantain'), choice('fried-yam', 'Fried Yam'), choice('potato-fries', 'Potato Fries')]), heatGroup, multiGroup('extras', 'Extras', [choice('extra-side', 'Extra Side', 350), choice('pepper-sauce', 'Pepper Sauce', 150)], { maxSelections: 2 })],
  },
  'yam-tomato-stew': {
    name: 'Yam & Tomato Stew',
    unitAmount: 3300,
    optionGroups: [portionGroup(700), heatGroup, multiGroup('add-protein', 'Add Protein', [choice('chicken', 'Chicken', 400), choice('turkey', 'Turkey', 450), choice('fish', 'Fish', 500)], { maxSelections: 2 })],
  },
};

export const resolveCustomizations = (productId, rawGroups) => {
  const product = catalog[productId];
  if (!product) return { valid: false, error: 'Unknown product.' };

  const submittedGroups = Array.isArray(rawGroups) ? rawGroups : [];
  const submittedById = new Map(submittedGroups.map(group => [group?.groupId, group]));
  const selections = [];

  for (const group of product.optionGroups) {
    const submitted = submittedById.get(group.id);
    const selectedIds = Array.isArray(submitted?.selectionIds) ? [...new Set(submitted.selectionIds)] : [];
    const validOptions = selectedIds.map(id => group.options.find(option => option.id === id));

    if (validOptions.some(option => !option) || validOptions.length < group.minSelections || validOptions.length > group.maxSelections) {
      return { valid: false, error: `Please complete ${group.name}.` };
    }
    if (group.selectionType === 'single' && validOptions.length > 1) {
      return { valid: false, error: `Please choose one option for ${group.name}.` };
    }

    if (validOptions.length) {
      selections.push({
        groupId: group.id,
        groupName: group.name,
        selections: validOptions.map(option => ({ ...option })),
      });
    }
  }

  const optionAmount = selections.reduce((groupTotal, group) => groupTotal + group.selections.reduce((total, option) => total + option.priceAdjustment, 0), 0);
  return {
    valid: true,
    selections,
    optionAmount,
    unitAmount: product.unitAmount + optionAmount,
  };
};

export const customizationSignature = (productId, selections) => `${productId}:${selections
  .map(group => `${group.groupId}=${group.selections.map(option => option.id).sort().join(',')}`)
  .sort()
  .join('|')}`;

export const customizationSummary = selections => selections
  .map(group => `${group.groupName}: ${group.selections.map(option => option.name).join(', ')}`)
  .join(' · ');
