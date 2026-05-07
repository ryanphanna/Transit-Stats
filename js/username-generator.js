/**
 * TransitStats - Username Generation & Validation
 */
export const UsernameGenerator = {
    ADJECTIVES: ['Speedy', 'Swift', 'Rapid', 'Express', 'Local', 'Nomad', 'Steady', 'Reliable', 'Urban', 'Silver', 'Golden', 'Electric'],
    TRANSIT: ['Bus', 'Train', 'Subway', 'Streetcar', 'TTC', 'GO', 'Rocket', 'Track', 'Rail', 'Commuter', 'Rider', 'Line'],
    FUN: ['Panda', 'Taco', 'Pizza', 'Falcon', 'Robot', 'Wizard', 'Captain', 'Ninja', 'Cookie', 'Cactus', 'Ghost', 'Donut'],

    // Obvious blocks - expand as needed
    BLACKLIST: ['admin', 'transitstats', 'support', 'staff', 'moderator', 'ilikepussy', 'pussy', 'dick', 'fuck', 'shit', 'asshole', 'nigger', 'faggot'],

    generate() {
        const pool = [this.ADJECTIVES, this.TRANSIT, this.FUN];
        
        // Randomly pick 2 or 3 categories
        const useThree = Math.random() > 0.5;
        let parts = [];
        
        if (useThree) {
            parts = [
                this.getRandom(this.ADJECTIVES),
                this.getRandom(this.TRANSIT),
                this.getRandom(this.FUN)
            ];
        } else {
            // Pick two different categories
            const cats = this.shuffle([...pool]).slice(0, 2);
            parts = [this.getRandom(cats[0]), this.getRandom(cats[1])];
        }

        return parts.join('_').toLowerCase();
    },

    getRandom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    },

    shuffle(arr) {
        return arr.sort(() => Math.random() - 0.5);
    },

    isValid(username) {
        if (!username) return { valid: false, error: 'Username is required.' };
        const clean = username.trim().toLowerCase();
        
        if (!/^[a-z0-9_]{3,20}$/.test(clean)) {
            return { valid: false, error: '3-20 characters: letters, numbers, underscores only.' };
        }

        if (this.BLACKLIST.some(word => clean.includes(word))) {
            return { valid: false, error: 'This username is not allowed.' };
        }

        return { valid: true };
    }
};
