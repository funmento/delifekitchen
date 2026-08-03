import { catalog } from '../../catalog.mjs';

const display = [
  ['fried-plantain', '/assets/fried plantain.jpeg', 'Traditional ripe plantains, fried until beautifully crispy with a golden exterior and a soft, naturally sweet centre. A classic African and Caribbean favourite, served as the perfect side to any meal.'],
  ['delife-yamarita', '/assets/delife yamarita.jpeg', 'Crispy egg-battered yam slices served with flavorful tomato and pepper sauce. Contains egg.'],
  ['egusi-soup', '/assets/egusi soup with choice of pounded yam garri oatmeal fufu.jpeg', 'A traditional African delicious soup prepared with grounded African melon (egusi) seeds and traditional spices, fresh vegetable leaves, assorted meat and fishes.'],
  ['fish-peppersoup', '/assets/fish peppersoup.jpeg', 'Fish pepper soup made with fresh cat fish, simmered in special African traditional hot spices, herbs and peppers. Bold, warming and satisfying.'],
  ['fried-rice', '/assets/fried rice.jpeg', 'Fried vegetable rice made with fresh mixed vegetables, onions and special spices, with optional grilled protein add-ons.'],
  ['jollof-rice-chicken', '/assets/jollof rice and chicken.jpeg', 'Authentic Nigerian party-style jollof rice, slow-cooked in a flavorful tomato and pepper sauce with aromatic spices and chicken.'],
  ['jollof-rice', '/assets/jollof rice.jpeg', 'Authentic Nigerian party-style jollof rice with a smoky finish and optional beef, chicken, fish, plantain and moi moi add-ons.'],
  ['meat-pie', '/assets/meatpie.jpeg', 'A tasty Nigerian-style meat pie made with beef, carrot and special African spices. Sold as one piece.'],
  ['moi-moi', '/assets/moi moi.jpeg', 'Delicious beans pudding made with red peppers, onions and a blend of special spices.'],
  ['nkwobi', '/assets/nkwobi.jpeg', 'A delightful combo of abacha, grilled fish and nkwobi, offering a taste of spicy traditional African vegetable salad.'],
  ['nsala-soup', '/assets/nsala soup with choice of pounded yam garri oatmeal fufu.jpeg', 'A traditional African soup cooked with aromatic spices, peppers, fresh vegetable leaves, assorted meat and fishes.'],
  ['okra-soup', '/assets/okra soup with choice of pounded yam garri oatmeal fufu.jpeg', 'A traditional soup rich with tender okro, fresh vegetable leaves and aromatic spices, prepared with assorted meat and fishes.'],
  ['stewed-chicken', '/assets/stewed chicken.jpeg', 'Tender chicken stewed to perfection, offering a comforting and savoury experience.'],
  ['stewed-turkey', '/assets/stewed turkey.jpeg', 'Tender turkey in a rich and flavourful stew.'],
  ['stewed-turkey-2', '/assets/stewed turkey2.jpeg', 'Tender turkey in a rich and flavourful stew.'],
  ['tilapia-fish', '/assets/tilapia fish with a choice of fried plantain, fried yam or potato fries.jpeg', 'Grilled medium tilapia fish richly garnished with onion, ginger, garlic and special spices, served with a choice of side.'],
  ['yam-tomato-stew', '/assets/yam and tomato stew.jpeg', 'Boiled or fried yam served with delicious tomato stew prepared with fresh tomatoes and special spices.'],
];

export const staticProducts = display.map(([slug, imageUrl, description], index) => ({
  slug,
  name: catalog[slug].name,
  shortDescription: description,
  fullDescription: description,
  price: catalog[slug].unitAmount,
  imageUrl,
  sortOrder: (index + 1) * 10,
  optionGroups: catalog[slug].optionGroups,
}));
