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

const soupPreparationGroup = singleGroup('choose-preparation', 'Choose your preparation', [
  choice('with-pounded-yam', 'With Pounded Yam'),
  choice('with-oat-meal', 'With Oat Meal'),
  choice('extra-pounded-yam', 'Extra Pounded Yam', 499),
  choice('extra-oat-meal', 'Extra Oat Meal', 499),
  choice('with-garri', 'With Garri'),
  choice('extra-garri', 'Extra Garri', 499),
  choice('cassava-fufu', 'Cassava Fufu'),
  choice('extra-cassava-fufu', 'Extra Cassava Fufu', 499),
]);

const fullMealAddOns = [
  choice('stewed-turkey', 'Stewed Turkey', 799),
  choice('stewed-beef', 'Stewed Beef', 599),
  choice('stewed-hake-fish', 'Stewed Hake Fish', 599),
  choice('stewed-mackerel-fish', 'Stewed Mackerel Fish', 599),
  choice('fried-plantain', 'Fried Plantain', 500),
  choice('stewed-chicken', 'Stewed Chicken', 599),
  choice('moi-moi', 'Moi Moi', 399),
  choice('grilled-chicken', 'Grilled Chicken', 599),
];

export const catalog = {
  'fried-plantain': {
    name: 'Fried Plantain',
    unitAmount: 599,
    optionGroups: [],
  },
  'delife-yamarita': {
    name: 'DeLife Yamarita',
    unitAmount: 1199,
    optionGroups: [],
  },
  'egusi-soup': {
    name: 'Egusi Soup with Choice of Pounded Yam, Oat Meal, Garri or Cassava Fufu',
    unitAmount: 1799,
    optionGroups: [soupPreparationGroup],
  },
  'fish-peppersoup': {
    name: 'Fish Pepper Soup',
    unitAmount: 1799,
    optionGroups: [singleGroup('choose-add-ons', 'Choose your add-ons', [choice('white-yam', 'White Yam', 599), choice('white-rice', 'White Rice', 699)], { required: false })],
  },
  'fried-rice': {
    name: 'Fried or Vegetable Rice',
    unitAmount: 1199,
    optionGroups: [singleGroup('choose-serving', 'Choose your serving', [
      choice('grilled-chicken', 'Grilled Chicken', 699),
      choice('grilled-hake-fish', 'Grilled Hake Fish', 799),
      choice('grilled-mackerel-fish', 'Grilled Mackerel Fish', 799),
      choice('grilled-turkey', 'Grilled Turkey', 799),
      choice('moi-moi', 'Moi Moi', 699),
    ], { required: false })],
  },
  'jollof-rice-chicken': {
    name: 'Jollof Rice with Chicken',
    unitAmount: 1299,
    optionGroups: [multiGroup('choose-add-ons', 'Choose your add-ons', fullMealAddOns)],
  },
  'jollof-rice': {
    name: 'Jollof Rice',
    unitAmount: 999,
    optionGroups: [singleGroup('choose-add-ons', 'Choose your add-ons', [
      choice('stewed-chicken', 'Stewed Chicken', 599),
      choice('stewed-beef', 'Stewed Beef', 799),
      choice('stewed-mackerel-fish', 'Stewed Mackerel Fish', 599),
      choice('stewed-hake-fish', 'Stewed Hake Fish', 599),
      choice('stewed-turkey', 'Stewed Turkey', 799),
      choice('fried-plantain', 'Fried Plantain', 500),
      choice('moi-moi', 'Moi Moi', 359),
    ], { required: false })],
  },
  'meat-pie': {
    name: 'Meat Pie',
    unitAmount: 299,
    optionGroups: [],
  },
  'moi-moi': {
    name: 'Moi Moi',
    unitAmount: 699,
    optionGroups: [],
  },
  nkwobi: {
    name: 'Abacha 102 with Grilled Fish and Nkwobi',
    unitAmount: 1799,
    optionGroups: [],
  },
  'nsala-soup': {
    name: 'Nsala Soup with Choice of Pounded Yam Oat Meal Garri or Cassava Fufu',
    unitAmount: 1799,
    optionGroups: [soupPreparationGroup],
  },
  'okra-soup': {
    name: 'Okro Soup with Choice of Pounded Yam, Oat Meal, Garri or Cassava Fufu',
    unitAmount: 1799,
    optionGroups: [soupPreparationGroup],
  },
  'stewed-chicken': {
    name: 'Stewed Chicken',
    unitAmount: 799,
    optionGroups: [],
  },
  'stewed-turkey': {
    name: 'Stewed Turkey',
    unitAmount: 799,
    optionGroups: [],
  },
  'stewed-turkey-2': {
    name: 'Stewed Turkey',
    unitAmount: 799,
    optionGroups: [],
  },
  'tilapia-fish': {
    name: 'Grilled Medium Tilapia Fish Served with Fried Yam, Fried Plantain or Potato Fries',
    unitAmount: 2999,
    optionGroups: [singleGroup('choose-serving', 'Choose your serving', [choice('fried-yam', 'Fried Yam'), choice('plantain', 'Plantain'), choice('potato-fries', 'Potato Fries')])],
  },
  'yam-tomato-stew': {
    name: 'Yam with Tomato Stew',
    unitAmount: 1199,
    optionGroups: [
      multiGroup('choose-add-ons', 'Choose your add-ons', fullMealAddOns),
      singleGroup('choose-preparation', 'Choose your preparation', [choice('fried-yam', 'Fried Yam'), choice('boiled-yam', 'Boiled Yam')], { required: false }),
    ],
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
