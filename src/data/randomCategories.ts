//
// const categoryList = [
//     // Science and Technology
//     'Astronomy', 'Physics', 'Chemistry', 'Biology', 'Geology', 'Quantum Mechanics', 'Genetics', 'Astrophysics',
//     'Environmental Science', 'Botany', 'Zoology', 'Ecology', 'Microbiology', 'Virology', 'Paleontology',
//     'Space Exploration', 'Robotics', 'Artificial Intelligence', 'Machine Learning', 'Blockchain',
//     'Cybersecurity', 'Data Science', 'Cloud Computing', 'Quantum Computing', 'Renewable Energy', 'Nanotechnology',
//     'Electronics', 'Automation', 'Web Development', 'Mobile Apps', 'Programming Languages', 'Algorithms',
//     'Hacking', 'Internet of Things', '5G Technology', 'Drones', 'Augmented Reality', 'Virtual Reality',
//     'Social Media', 'Digital Marketing', 'Video Game Design', 'E-Commerce', 'Cryptocurrency',
//     'Mars Rovers', 'Telescope Discoveries', 'Energy Efficiency', 'Space Debris', 'Neural Networks',
//     'Innovative Gadgets', 'Biohacking', 'Green Energy', 'Medical Nanotechnology', 'Autonomous Vehicles',
//     'Smart Cities', 'Underwater Exploration', 'Rocket Launches', 'SETI Research',
//
//     // History
//     'Ancient Egypt', 'Roman Empire', 'Greek Mythology', 'Renaissance', 'Industrial Revolution',
//     'World War I', 'World War II', 'Cold War', 'French Revolution', 'American Revolution',
//     'Vikings', 'Medieval Europe', 'Samurai Culture', 'Colonial America', 'Civil Rights Movement',
//     'History of Medicine', 'Exploration of the Americas', 'Famous Historical Leaders',
//     'Treaties and Alliances', 'Crusades', 'Ottoman Empire', 'Fall of the Berlin Wall', 'Space Race',
//     'Napoleonic Wars', 'The Crusades', 'Genghis Khan’s Empire', 'The Ming Dynasty', 'Salem Witch Trials',
//     'Boston Tea Party', 'Apollo 11 Mission', 'Dark Ages', 'War of Roses', 'Berlin Airlift',
//     'Vietnam War', 'Cultural Revolution of the 60s', 'Women’s Suffrage Movement', 'Prohibition Era', 'Black Death',
//
//     // Geography
//     'World Capitals', 'Mountain Ranges', 'Longest Rivers', 'Largest Deserts', 'Oceans and Seas',
//     'Island Nations', 'Countries of Europe', 'Countries of Asia', 'Countries of Africa', 'Countries of South America',
//     'Famous Landmarks', 'Tropical Rainforests', 'National Parks', 'Ancient Cities', 'UNESCO World Heritage Sites',
//     'Volcanoes', 'Caves', 'Islands', 'Geographic Wonders', 'Time Zones', 'Coastal Regions',
//     'Fjords', 'Glaciers', 'Rain Shadows', 'Hot Springs', 'Coral Reefs', 'Monsoons', 'Natural Disasters',
//     'Desert Oases', 'Salt Flats', 'Plateau Formations', 'Cultural Capitals', 'Arctic Regions',
//
//     // Movies and TV Shows
//     'Oscar-Winning Movies', 'Animated Movies', 'Science Fiction Films', 'Horror Movies', 'Fantasy Movies',
//     'Romantic Comedies', 'Classic Hollywood', 'Famous Movie Directors', 'Superhero Movies', 'Action Movies',
//     'Thriller Films', 'Cult Films', 'Documentaries', 'TV Show Characters', 'Sitcoms',
//     'Streaming Platforms', 'Movie Franchises', 'Award Shows', 'Famous Actors', 'Horror Series',
//     'Star Wars Universe', 'Game of Thrones', 'Harry Potter Franchise', 'The Matrix Series', 'Breaking Bad',
//     'The Office', 'Stranger Things', 'Friends', 'The Simpsons', 'Parks and Recreation', 'The Big Bang Theory',
//     'Better Call Saul', 'WandaVision', 'House of Cards', 'How I Met Your Mother', 'Squid Game', 'Rick and Morty',
//
//     // Gaming
//     'Video Game Franchises', 'RPG Games', 'Mobile Games', 'PC Games', 'Esports Players', 'Board Games',
//     'Card Games', 'Arcade Games', 'Game Consoles', 'Strategy Games', 'Puzzle Games', 'Indie Games',
//     'Retro Games', 'Game Studios', 'First-Person Shooters', 'Fantasy Games', 'Simulation Games',
//     'Mario Franchise', 'Zelda Series', 'Call of Duty', 'The Elder Scrolls', 'Minecraft',
//     'The Witcher', 'Red Dead Redemption', 'Fortnite', 'League of Legends', 'Valorant',
//     'Overwatch', 'Cyberpunk 2077', 'Assassin’s Creed', 'Among Us', 'Stardew Valley', 'Animal Crossing',
//     'Battlefield', 'Pokemon Franchise', 'Super Smash Bros', 'FIFA Games', 'Civilization Franchise',
//
//     // Literature and Books
//     'Shakespeare Plays', 'Science Fiction Novels', 'Mystery Books', 'Fantasy Novels', 'Historical Fiction',
//     'Romance Novels', 'Famous Authors', 'Philosophy Books', 'Classic Literature', 'Essays',
//     'Children’s Books', 'Graphic Novels', 'Dystopian Fiction', 'Mythological Stories', 'Biographies',
//     'Harry Potter Books', 'Lord of the Rings Trilogy', 'Sherlock Holmes Series', 'Percy Jackson Series',
//     'Pride and Prejudice', '1984', 'The Great Gatsby', 'To Kill a Mockingbird', 'Moby Dick',
//     'War and Peace', 'A Tale of Two Cities', 'The Hobbit', 'Wuthering Heights', 'The Catcher in the Rye',
//     'Les Misérables', 'Brave New World', 'Slaughterhouse-Five', 'The Hunger Games', 'Dune',
//     'Dracula', 'The Da Vinci Code', 'The Alchemist', 'The Wheel of Time', 'The Chronicles of Narnia',
//
//     // Music
//     'Rock Bands', 'Hip Hop Artists', 'Country Music', 'Pop Artists', 'Jazz Legends',
//     'Classical Composers', 'Opera Songs', 'Electronic Beats', 'Famous Albums', 'Musical Instruments',
//     'Music Awards', 'Movie Soundtracks', 'Choirs', 'Orchestras', 'Songs of the 80s',
//     'Taylor Swift Albums', 'Adele Hits', 'Beatles Songs', 'Rolling Stones Classics', 'Elvis Presley Hits',
//     'Grammy Winners', 'Billboard Hot 100', 'Pink Floyd Albums', 'Metallica Songs', 'Queen Anthems',
//     'Rap Battles', 'One-Hit Wonders', 'American Idol Stars', 'Eurovision Songs', 'Songwriting Legends',
//     'Coldplay Favorites', 'K-Pop Sensations', 'BTS Albums', 'Ed Sheeran Hits', 'Bruno Mars Songs',
//
//     // Food and Drinks
//     'Global Cuisines', 'Street Foods', 'Vegan Dishes', 'Desserts', 'Cocktails', 'Wine Varieties',
//     'Coffee Brews', 'Cheeses of the World', 'Bread Types', 'Spices and Herbs', 'Famous Restaurants',
//     'Soups and Stews', 'Classic Recipes', 'Baking Techniques', 'Ice Cream Flavors',
//     'Pasta Varieties', 'Asian Dishes', 'BBQ Styles', 'Seafood Dishes', 'Michelin Chefs',
//     'Fast Food Chains', 'Fine Dining', 'Chocolate Desserts', 'Exotic Fruits', 'Unique Beverages',
//     'Pizza Toppings', 'Sandwiches', 'Tropical Smoothies', 'Breakfast Foods', 'Spicy Dishes',
//
//     // Miscellaneous
//     'Astrology Signs', 'Zodiac Predictions', 'Superheroes', 'DIY Trends', 'Interior Design',
//     'Architecture Styles', 'Famous Paintings', 'Sketching Techniques', 'Gardening Tools', 'Luxury Cars',
//     'Motorbikes', 'Celebrity Scandals', 'Paranormal Stories', 'Haunted Places', 'Urban Legends',
//     'Aliens and UFOs', 'Tarot Cards Readings', 'Meditation Types', 'Famous Cartoons', 'Comic Heroes',
//     'Travel Adventures', 'Luxury Beach Resorts', 'Space Travel Plans', 'Wildlife Tours', 'Magical Spells'
// ];
//
// export default categoryList;