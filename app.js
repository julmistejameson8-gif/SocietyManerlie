const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware basique
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Initialisation base de données
const db = new sqlite3.Database('./credit.db', (err) => {
    if (err) {
        console.error('Erreur DB:', err.message);
    } else {
        console.log('✅ Connecté à SQLite');
        initDatabase();
    }
});

function initDatabase() {
    db.serialize(() => {
        // Table utilisateurs
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE,
            password TEXT,
            name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Table crédits
        db.run(`CREATE TABLE IF NOT EXISTS credits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            client_name TEXT,
            client_email TEXT,
            amount REAL,
            interest_rate REAL,
            duration INTEGER,
            monthly_payment REAL,
            total_interest REAL,
            total_amount REAL,
            start_date TEXT,
            status TEXT DEFAULT 'active',
            paid_months INTEGER DEFAULT 0,
            paid_amount REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Table paiements
        db.run(`CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            credit_id INTEGER,
            month INTEGER,
            amount REAL,
            payment_date TEXT,
            method TEXT,
            reference TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Créer utilisateur admin
        const hashedPassword = bcrypt.hashSync('admin123', 10);
        db.run(`INSERT OR IGNORE INTO users (email, password, name) VALUES (?, ?, ?)`, 
            ['admin@creditapp.com', hashedPassword, 'Admin']);
        
        console.log('✅ Base de données initialisée');
    });
}

// Routes API simples
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    
    db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Erreur base de données' });
        }
        
        if (!user) {
            return res.status(401).json({ error: 'Utilisateur non trouvé' });
        }

        if (!bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ error: 'Mot de passe incorrect' });
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name
            }
        });
    });
});

app.get('/api/credits/:userId', (req, res) => {
    db.all('SELECT * FROM credits WHERE user_id = ? ORDER BY created_at DESC', [req.params.userId], (err, credits) => {
        if (err) {
            return res.status(500).json({ error: 'Erreur base de données' });
        }
        res.json(credits);
    });
});

app.post('/api/credits', (req, res) => {
    const { userId, clientName, clientEmail, amount, interestRate, duration, startDate } = req.body;

    // Calculs
    const monthlyRate = interestRate / 100 / 12;
    const monthlyPayment = amount * (monthlyRate * Math.pow(1 + monthlyRate, duration)) / (Math.pow(1 + monthlyRate, duration) - 1);
    const totalInterest = (monthlyPayment * duration) - amount;
    const totalAmount = amount + totalInterest;

    db.run(
        `INSERT INTO credits (user_id, client_name, client_email, amount, interest_rate, duration, 
         monthly_payment, total_interest, total_amount, start_date) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, clientName, clientEmail, amount, interestRate, duration, monthlyPayment, totalInterest, totalAmount, startDate],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Erreur création crédit' });
            }
            res.json({ 
                success: true, 
                creditId: this.lastID,
                monthlyPayment: monthlyPayment.toFixed(2),
                totalInterest: totalInterest.toFixed(2)
            });
        }
    );
});

app.post('/api/payments', (req, res) => {
    const { creditId, month, amount, paymentDate, method, reference } = req.body;

    db.run(
        `INSERT INTO payments (credit_id, month, amount, payment_date, method, reference) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [creditId, month, amount, paymentDate, method, reference],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Erreur enregistrement paiement' });
            }

            // Mettre à jour le crédit
            db.get('SELECT paid_months, paid_amount FROM credits WHERE id = ?', [creditId], (err, credit) => {
                const newPaidMonths = (credit.paid_months || 0) + 1;
                const newPaidAmount = (credit.paid_amount || 0) + parseFloat(amount);

                db.run(
                    'UPDATE credits SET paid_months = ?, paid_amount = ? WHERE id = ?',
                    [newPaidMonths, newPaidAmount, creditId],
                    (err) => {
                        if (err) {
                            console.error('Erreur mise à jour crédit:', err);
                        }
                        res.json({ success: true, message: 'Paiement enregistré' });
                    }
                );
            });
        }
    );
});

app.delete('/api/credits/:creditId', (req, res) => {
    db.run('DELETE FROM credits WHERE id = ?', [req.params.creditId], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Erreur suppression' });
        }
        // Supprimer aussi les paiements associés
        db.run('DELETE FROM payments WHERE credit_id = ?', [req.params.creditId]);
        res.json({ success: true, message: 'Crédit supprimé' });
    });
});

// Route racine
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Démarrer le serveur
app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré: http://localhost:${PORT}`);
    console.log(`📊 Fichier DB: credit.db`);
    console.log(`👤 Compte: admin@creditapp.com / admin123`);
});

console.log('✅ app.js chargé - Démarrage du serveur...');