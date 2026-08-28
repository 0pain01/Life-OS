// A curated set of common Indian foods/dishes with approximate nutrition per
// 100g, seeded into the local catalog so search works offline and covers
// home-style dishes that packaged-goods databases (like Open Food Facts)
// generally don't have. Values are reasonable generic estimates for a
// typical home preparation — actual recipes vary by household, so users can
// still add a more precise custom food if needed.
//
// { name, calories, protein, fat, carbs } — all per 100g.
const INDIAN_FOODS = [
  // Staples & breads
  { name: 'Roti / Chapati (whole wheat)', calories: 297, protein: 8.7, fat: 6.9, carbs: 51 },
  { name: 'Naan', calories: 310, protein: 9, fat: 8, carbs: 51 },
  { name: 'Paratha (plain)', calories: 330, protein: 6.5, fat: 15, carbs: 43 },
  { name: 'Aloo Paratha', calories: 265, protein: 5.8, fat: 11, carbs: 36 },
  { name: 'Puri', calories: 370, protein: 6.5, fat: 21, carbs: 39 },
  { name: 'Steamed Rice (white)', calories: 130, protein: 2.7, fat: 0.3, carbs: 28 },
  { name: 'Brown Rice, cooked', calories: 123, protein: 2.7, fat: 1, carbs: 26 },
  { name: 'Jeera Rice', calories: 165, protein: 3, fat: 5, carbs: 27 },
  { name: 'Curd Rice', calories: 120, protein: 3.2, fat: 3.5, carbs: 19 },
  { name: 'Idli', calories: 132, protein: 4, fat: 0.4, carbs: 28 },
  { name: 'Plain Dosa', calories: 168, protein: 3.9, fat: 3.7, carbs: 29 },
  { name: 'Masala Dosa', calories: 195, protein: 4.5, fat: 8, carbs: 27 },
  { name: 'Uttapam', calories: 172, protein: 4.2, fat: 4, carbs: 29 },
  { name: 'Appam', calories: 155, protein: 2.6, fat: 2.5, carbs: 30 },
  { name: 'Poha', calories: 158, protein: 3, fat: 4.5, carbs: 27 },
  { name: 'Upma', calories: 165, protein: 3.8, fat: 5.5, carbs: 26 },

  // Dals & legumes
  { name: 'Dal Tadka', calories: 115, protein: 6.5, fat: 4, carbs: 14 },
  { name: 'Dal Makhani', calories: 170, protein: 7, fat: 9, carbs: 15 },
  { name: 'Sambar', calories: 95, protein: 4.5, fat: 2.5, carbs: 13 },
  { name: 'Rasam', calories: 45, protein: 2, fat: 1, carbs: 7 },
  { name: 'Chana Masala (Chole)', calories: 164, protein: 7.5, fat: 5.5, carbs: 22 },
  { name: 'Rajma Curry', calories: 140, protein: 7.5, fat: 3.5, carbs: 20 },
  { name: 'Moong Dal, cooked', calories: 105, protein: 7, fat: 0.4, carbs: 19 },
  { name: 'Toor Dal, cooked', calories: 120, protein: 7, fat: 1, carbs: 21 },
  { name: 'Sprouts Salad (moong)', calories: 90, protein: 7, fat: 0.6, carbs: 15 },

  // Paneer / vegetable dishes
  { name: 'Paneer Butter Masala', calories: 260, protein: 11, fat: 20, carbs: 8 },
  { name: 'Palak Paneer', calories: 190, protein: 10, fat: 14, carbs: 6 },
  { name: 'Shahi Paneer', calories: 270, protein: 10, fat: 21, carbs: 9 },
  { name: 'Matar Paneer', calories: 200, protein: 9.5, fat: 14, carbs: 9 },
  { name: 'Paneer Tikka', calories: 240, protein: 15, fat: 18, carbs: 6 },
  { name: 'Aloo Gobi', calories: 110, protein: 2.5, fat: 6, carbs: 12 },
  { name: 'Baingan Bharta', calories: 105, protein: 2, fat: 7, carbs: 9 },
  { name: 'Bhindi Masala', calories: 120, protein: 2.5, fat: 8, carbs: 10 },
  { name: 'Mixed Vegetable Curry', calories: 100, protein: 2.5, fat: 5.5, carbs: 11 },
  { name: 'Aloo Sabzi (dry)', calories: 135, protein: 2, fat: 6, carbs: 19 },
  { name: 'Kadhi', calories: 95, protein: 3, fat: 5, carbs: 9 },

  // Rice mains
  { name: 'Vegetable Biryani', calories: 165, protein: 3.5, fat: 6, carbs: 24 },
  { name: 'Chicken Biryani', calories: 195, protein: 9, fat: 8, carbs: 20 },
  { name: 'Mutton Biryani', calories: 210, protein: 10, fat: 10, carbs: 19 },
  { name: 'Vegetable Pulao', calories: 160, protein: 3, fat: 5.5, carbs: 24 },
  { name: 'Khichdi', calories: 120, protein: 4, fat: 2.5, carbs: 20 },

  // Non-veg
  { name: 'Chicken Curry', calories: 165, protein: 15, fat: 10, carbs: 4 },
  { name: 'Butter Chicken', calories: 240, protein: 15, fat: 17, carbs: 6 },
  { name: 'Chicken Tikka', calories: 195, protein: 24, fat: 10, carbs: 3 },
  { name: 'Tandoori Chicken', calories: 175, protein: 25, fat: 7, carbs: 2 },
  { name: 'Egg Curry', calories: 145, protein: 9, fat: 10, carbs: 4 },
  { name: 'Fish Curry', calories: 145, protein: 16, fat: 8, carbs: 3 },
  { name: 'Mutton Curry', calories: 210, protein: 17, fat: 15, carbs: 4 },
  { name: 'Boiled Egg', calories: 155, protein: 13, fat: 11, carbs: 1.1 },
  { name: 'Egg Bhurji', calories: 190, protein: 12, fat: 15, carbs: 2 },

  // Snacks & street food
  { name: 'Samosa', calories: 262, protein: 4.5, fat: 15, carbs: 28 },
  { name: 'Vegetable Pakora', calories: 250, protein: 5, fat: 16, carbs: 22 },
  { name: 'Vada (Medu Vada)', calories: 245, protein: 6.5, fat: 14, carbs: 24 },
  { name: 'Dhokla', calories: 160, protein: 6, fat: 3.5, carbs: 27 },
  { name: 'Pav Bhaji', calories: 190, protein: 4, fat: 9, carbs: 24 },
  { name: 'Vada Pav', calories: 280, protein: 6, fat: 13, carbs: 35 },
  { name: 'Pani Puri (per plate, ~6 pcs)', calories: 220, protein: 4, fat: 6, carbs: 38 },
  { name: 'Bhel Puri', calories: 190, protein: 4, fat: 6, carbs: 30 },
  { name: 'Misal Pav', calories: 220, protein: 8, fat: 10, carbs: 24 },
  { name: 'Chicken 65', calories: 260, protein: 20, fat: 16, carbs: 8 },
  { name: 'Spring Roll (veg)', calories: 220, protein: 4, fat: 11, carbs: 26 },

  // Sweets & desserts
  { name: 'Gulab Jamun', calories: 340, protein: 4, fat: 13, carbs: 52 },
  { name: 'Jalebi', calories: 380, protein: 2, fat: 14, carbs: 62 },
  { name: 'Rasgulla', calories: 186, protein: 4, fat: 2, carbs: 38 },
  { name: 'Kheer (rice pudding)', calories: 130, protein: 3.5, fat: 4, carbs: 20 },
  { name: 'Halwa (gajar/suji)', calories: 300, protein: 3.5, fat: 14, carbs: 40 },
  { name: 'Ladoo (besan/motichoor)', calories: 400, protein: 6, fat: 18, carbs: 54 },
  { name: 'Barfi', calories: 380, protein: 6, fat: 18, carbs: 48 },
  { name: 'Kulfi', calories: 200, protein: 4.5, fat: 11, carbs: 21 },

  // Dairy & beverages
  { name: 'Curd / Dahi (plain)', calories: 60, protein: 3.5, fat: 3.3, carbs: 4.7 },
  { name: 'Paneer (raw)', calories: 265, protein: 18, fat: 20, carbs: 3.5 },
  { name: 'Ghee', calories: 900, protein: 0, fat: 100, carbs: 0 },
  { name: 'Buttermilk / Chaas', calories: 30, protein: 1.5, fat: 1, carbs: 3 },
  { name: 'Lassi (sweet)', calories: 110, protein: 3, fat: 3, carbs: 17 },
  { name: 'Masala Chai (with milk & sugar)', calories: 55, protein: 1.2, fat: 1.8, carbs: 8 },
  { name: 'Filter Coffee (with milk & sugar)', calories: 60, protein: 1.5, fat: 2, carbs: 8 },

  // Raw staples / ingredients
  { name: 'Atta (whole wheat flour, raw)', calories: 340, protein: 12, fat: 1.7, carbs: 69 },
  { name: 'Besan (gram flour, raw)', calories: 387, protein: 22, fat: 6.7, carbs: 58 },
  { name: 'Basmati Rice (raw)', calories: 349, protein: 7.1, fat: 0.6, carbs: 78 },
  { name: 'Toor Dal (raw)', calories: 335, protein: 22, fat: 1.5, carbs: 57 },
  { name: 'Moong Dal (raw)', calories: 347, protein: 24, fat: 1.2, carbs: 59 },

  // Fruits common in India
  { name: 'Mango (raw fruit)', calories: 60, protein: 0.8, fat: 0.4, carbs: 15 },
  { name: 'Banana', calories: 89, protein: 1.1, fat: 0.3, carbs: 23 },
  { name: 'Guava', calories: 68, protein: 2.6, fat: 1, carbs: 14 },
  { name: 'Papaya', calories: 43, protein: 0.5, fat: 0.3, carbs: 11 },
  { name: 'Pomegranate', calories: 83, protein: 1.7, fat: 1.2, carbs: 19 },
];

/**
 * Seed the Indian foods catalog into the given better-sqlite3 database
 * connection, if not already present. Idempotent — safe to call on every
 * app start.
 */
function seedIndianFoods(db) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO foods
      (source, external_id, name, brand, serving_size, serving_unit, calories_per_100, protein_per_100, fat_per_100, carbs_per_100)
     VALUES ('seed_in', @external_id, @name, '', 100, 'g', @calories, @protein, @fat, @carbs)`
  );
  const tx = db.transaction((items) => {
    for (const item of items) {
      insert.run({
        external_id: `seed-${item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        ...item,
      });
    }
  });
  tx(INDIAN_FOODS);
}

module.exports = { seedIndianFoods, INDIAN_FOODS };
