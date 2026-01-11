require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://scholarstreambd.web.app',
    'https://scholarstreambd.firebaseapp.com'
  ],
  credentials: true
}));
app.use(express.json());

// MongoDB Connection
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: false,
    deprecationErrors: true,
  }
});

// JWT Verification Middleware
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: 'Unauthorized access' });
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: 'Unauthorized access' });
    }
    req.decoded = decoded;
    next();
  });
};

// Verify Admin Middleware
const verifyAdmin = async (req, res, next) => {
  const email = req.decoded.email;
  const user = await usersCollection.findOne({ email });
  if (user?.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden access' });
  }
  next();
};

// Verify Moderator Middleware
const verifyModerator = async (req, res, next) => {
  const email = req.decoded.email;
  const user = await usersCollection.findOne({ email });
  if (user?.role !== 'admin' && user?.role !== 'moderator') {
    return res.status(403).json({ message: 'Forbidden access' });
  }
  next();
};

let usersCollection, scholarshipsCollection, applicationsCollection, reviewsCollection, paymentsCollection;

async function run() {
  try {
    // Connect to MongoDB
    await client.connect();
    
    const database = client.db('scholarstream');
    usersCollection = database.collection('users');
    scholarshipsCollection = database.collection('scholarships');
    applicationsCollection = database.collection('applications');
    reviewsCollection = database.collection('reviews');
    paymentsCollection = database.collection('payments');

    console.log('Connected to MongoDB!');

    // ============ JWT Routes ============
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '7d' });
      res.json({ token });
    });

    // ============ User Routes ============
    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.json({ message: 'User already exists', insertedId: null });
      }
      // Keep role if provided (for demo users), otherwise default to student
      if (!user.role) {
        user.role = 'student';
      }
      user.createdAt = new Date();
      const result = await usersCollection.insertOne(user);
      res.json(result);
    });

    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const role = req.query.role;
      const query = role && role !== 'all' ? { role } : {};
      const users = await usersCollection.find(query).toArray();
      res.json(users);
    });

    app.get('/users/role/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).json({ message: 'Forbidden access' });
      }
      const user = await usersCollection.findOne({ email });
      res.json({ role: user?.role || 'student' });
    });

    app.patch('/users/:id/role', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const { role } = req.body;
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role } }
      );
      res.json(result);
    });

    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
      res.json(result);
    });

    // ============ Scholarship Routes ============
    app.get('/scholarships', async (req, res) => {
      const { search, category, country, degree, sort, page = 1, limit = 12 } = req.query;
      
      const query = {};
      if (search) {
        query.$or = [
          { scholarshipName: { $regex: search, $options: 'i' } },
          { universityName: { $regex: search, $options: 'i' } },
          { degree: { $regex: search, $options: 'i' } }
        ];
      }
      if (category && category !== 'all') query.scholarshipCategory = category;
      if (country && country !== 'all') query.universityCountry = country;
      if (degree && degree !== 'all') query.degree = degree;

      let sortOption = { scholarshipPostDate: -1 };
      if (sort === 'date-asc') sortOption = { scholarshipPostDate: 1 };
      if (sort === 'fees-asc') sortOption = { applicationFees: 1 };
      if (sort === 'fees-desc') sortOption = { applicationFees: -1 };

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const total = await scholarshipsCollection.countDocuments(query);
      const scholarships = await scholarshipsCollection
        .find(query)
        .sort(sortOption)
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();

      res.json({
        scholarships,
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
        currentPage: parseInt(page)
      });
    });

    app.get('/scholarships/categories', async (req, res) => {
      try {
        // Use aggregation instead of distinct for better compatibility
        const categoriesAgg = await scholarshipsCollection.aggregate([
          { $group: { _id: '$scholarshipCategory' } },
          { $match: { _id: { $ne: null } } },
          { $sort: { _id: 1 } }
        ]).toArray();
        
        const countriesAgg = await scholarshipsCollection.aggregate([
          { $group: { _id: '$universityCountry' } },
          { $match: { _id: { $ne: null } } },
          { $sort: { _id: 1 } }
        ]).toArray();
        
        const degreesAgg = await scholarshipsCollection.aggregate([
          { $group: { _id: '$degree' } },
          { $match: { _id: { $ne: null } } },
          { $sort: { _id: 1 } }
        ]).toArray();

        const categories = categoriesAgg.map(item => item._id);
        const countries = countriesAgg.map(item => item._id);
        const degrees = degreesAgg.map(item => item._id);
        
        res.json({ categories, countries, degrees });
      } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: 'Failed to fetch categories' });
      }
    });

    app.get('/scholarships/top', async (req, res) => {
      const scholarships = await scholarshipsCollection
        .find()
        .sort({ scholarshipPostDate: -1 })
        .limit(8)
        .toArray();
      res.json(scholarships);
    });

    app.get('/scholarships/admin/all', verifyToken, verifyAdmin, async (req, res) => {
      const scholarships = await scholarshipsCollection.find().sort({ scholarshipPostDate: -1 }).toArray();
      res.json(scholarships);
    });

    app.get('/scholarships/:id', async (req, res) => {
      const id = req.params.id;
      const scholarship = await scholarshipsCollection.findOne({ _id: new ObjectId(id) });
      res.json(scholarship);
    });

    app.get('/scholarships/related/:category/:excludeId', async (req, res) => {
      const { category, excludeId } = req.params;
      const scholarships = await scholarshipsCollection
        .find({ 
          scholarshipCategory: category, 
          _id: { $ne: new ObjectId(excludeId) } 
        })
        .limit(4)
        .toArray();
      res.json(scholarships);
    });

    app.post('/scholarships', verifyToken, verifyAdmin, async (req, res) => {
      const scholarship = req.body;
      const result = await scholarshipsCollection.insertOne(scholarship);
      res.json(result);
    });

    app.put('/scholarships/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const scholarship = req.body;
      delete scholarship._id;
      const result = await scholarshipsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: scholarship }
      );
      res.json(result);
    });

    app.delete('/scholarships/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await scholarshipsCollection.deleteOne({ _id: new ObjectId(id) });
      res.json(result);
    });

    // ============ Application Routes ============
    app.get('/applications/all', verifyToken, verifyModerator, async (req, res) => {
      const status = req.query.status;
      const query = status && status !== 'all' ? { applicationStatus: status } : {};
      const applications = await applicationsCollection.find(query).sort({ applicationDate: -1 }).toArray();
      res.json(applications);
    });

    app.get('/applications/user/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).json({ message: 'Forbidden access' });
      }
      const applications = await applicationsCollection.find({ userEmail: email }).sort({ applicationDate: -1 }).toArray();
      res.json(applications);
    });

    app.post('/applications', verifyToken, async (req, res) => {
      const application = req.body;
      const result = await applicationsCollection.insertOne(application);
      res.json(result);
    });

    app.patch('/applications/:id/status', verifyToken, verifyModerator, async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const result = await applicationsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { applicationStatus: status } }
      );
      res.json(result);
    });

    app.patch('/applications/:id/feedback', verifyToken, verifyModerator, async (req, res) => {
      const id = req.params.id;
      const { feedback } = req.body;
      const result = await applicationsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { feedback } }
      );
      res.json(result);
    });

    app.delete('/applications/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const result = await applicationsCollection.deleteOne({ _id: new ObjectId(id) });
      res.json(result);
    });

    // ============ Review Routes ============
    app.get('/reviews', async (req, res) => {
      const reviews = await reviewsCollection.find().sort({ reviewDate: -1 }).toArray();
      res.json(reviews);
    });

    app.get('/reviews/scholarship/:id', async (req, res) => {
      const scholarshipId = req.params.id;
      const reviews = await reviewsCollection.find({ scholarshipId }).sort({ reviewDate: -1 }).toArray();
      res.json(reviews);
    });

    app.get('/reviews/user/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const reviews = await reviewsCollection.find({ userEmail: email }).sort({ reviewDate: -1 }).toArray();
      res.json(reviews);
    });

    app.post('/reviews', verifyToken, async (req, res) => {
      const review = req.body;
      const result = await reviewsCollection.insertOne(review);
      res.json(result);
    });

    app.put('/reviews/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const review = req.body;
      delete review._id;
      const result = await reviewsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: review }
      );
      res.json(result);
    });

    app.delete('/reviews/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const result = await reviewsCollection.deleteOne({ _id: new ObjectId(id) });
      res.json(result);
    });

    // ============ Payment Routes ============
    app.post('/create-payment-intent', verifyToken, async (req, res) => {
      const { amount } = req.body;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount * 100,
        currency: 'usd',
        payment_method_types: ['card']
      });
      res.json({ clientSecret: paymentIntent.client_secret });
    });

    app.post('/payments', verifyToken, async (req, res) => {
      const payment = req.body;
      const result = await paymentsCollection.insertOne(payment);
      res.json(result);
    });

    app.get('/payments/user/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const payments = await paymentsCollection.find({ userEmail: email }).sort({ paymentDate: -1 }).toArray();
      res.json(payments);
    });

    // ============ Analytics Routes ============
    app.get('/analytics', verifyToken, verifyAdmin, async (req, res) => {
      const totalUsers = await usersCollection.countDocuments();
      const totalScholarships = await scholarshipsCollection.countDocuments();
      const totalApplications = await applicationsCollection.countDocuments();
      
      const payments = await paymentsCollection.find().toArray();
      const totalFeesCollected = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

      // Applications by University
      const applicationsByUniversity = await applicationsCollection.aggregate([
        { $group: { _id: '$universityName', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 6 }
      ]).toArray();

      // Applications by Category
      const applicationsByCategory = await applicationsCollection.aggregate([
        { $group: { _id: '$scholarshipCategory', count: { $sum: 1 } } }
      ]).toArray();

      // Status counts
      const statusCounts = {
        pending: await applicationsCollection.countDocuments({ applicationStatus: 'pending' }),
        processing: await applicationsCollection.countDocuments({ applicationStatus: 'processing' }),
        completed: await applicationsCollection.countDocuments({ applicationStatus: 'completed' }),
        rejected: await applicationsCollection.countDocuments({ applicationStatus: 'rejected' })
      };

      // User roles
      const userRoles = {
        student: await usersCollection.countDocuments({ role: 'student' }),
        moderator: await usersCollection.countDocuments({ role: 'moderator' }),
        admin: await usersCollection.countDocuments({ role: 'admin' })
      };

      // Payment status
      const paymentStatus = {
        paid: await applicationsCollection.countDocuments({ paymentStatus: 'paid' }),
        unpaid: await applicationsCollection.countDocuments({ paymentStatus: 'unpaid' })
      };

      res.json({
        totalUsers,
        totalScholarships,
        totalApplications,
        totalFeesCollected,
        applicationsByUniversity,
        applicationsByCategory,
        statusCounts,
        userRoles,
        paymentStatus
      });
    });

    // ============ Wishlist Routes ============
    app.post('/wishlist/:email', verifyToken, async (req, res) => {
      const { email } = req.params;
      const { scholarshipId } = req.body;
      const result = await usersCollection.updateOne(
        { email },
        { $addToSet: { wishlist: scholarshipId } }
      );
      res.json(result);
    });

    // Root Route
    app.get('/', (req, res) => {
      res.json({ message: 'ScholarStream API Server is running!' });
    });

    // Seed sample scholarships (for testing)
    app.post('/seed-scholarships', async (req, res) => {
      const existingCount = await scholarshipsCollection.countDocuments();
      if (existingCount > 0) {
        return res.json({ message: 'Scholarships already exist', count: existingCount });
      }

      const sampleScholarships = [
        {
          scholarshipName: "Global Excellence Scholarship",
          universityName: "Harvard University",
          universityImage: "https://images.unsplash.com/photo-1562774053-701939374585?w=800",
          universityCountry: "USA",
          universityCity: "Cambridge",
          universityWorldRank: 1,
          subjectCategory: "Engineering",
          scholarshipCategory: "Full fund",
          degree: "Masters",
          tuitionFees: 0,
          applicationFees: 50,
          serviceCharge: 10,
          applicationDeadline: "2025-06-30",
          scholarshipPostDate: new Date().toISOString(),
          postedUserEmail: "admin@scholarstream.com",
          scholarshipDescription: "Full scholarship for exceptional students pursuing Masters in Engineering."
        },
        {
          scholarshipName: "Future Leaders Program",
          universityName: "MIT",
          universityImage: "https://images.unsplash.com/photo-1564981797816-1043664bf78d?w=800",
          universityCountry: "USA",
          universityCity: "Boston",
          universityWorldRank: 2,
          subjectCategory: "Computer Science",
          scholarshipCategory: "Partial",
          degree: "Bachelor",
          tuitionFees: 20000,
          applicationFees: 75,
          serviceCharge: 15,
          applicationDeadline: "2025-05-15",
          scholarshipPostDate: new Date().toISOString(),
          postedUserEmail: "admin@scholarstream.com",
          scholarshipDescription: "Partial scholarship covering 50% tuition for CS students."
        },
        {
          scholarshipName: "Oxford Merit Award",
          universityName: "Oxford University",
          universityImage: "https://images.unsplash.com/photo-1580537659466-0a9bfa916a54?w=800",
          universityCountry: "UK",
          universityCity: "Oxford",
          universityWorldRank: 3,
          subjectCategory: "Business",
          scholarshipCategory: "Full fund",
          degree: "Masters",
          tuitionFees: 0,
          applicationFees: 60,
          serviceCharge: 12,
          applicationDeadline: "2025-07-20",
          scholarshipPostDate: new Date().toISOString(),
          postedUserEmail: "admin@scholarstream.com",
          scholarshipDescription: "Full merit-based scholarship for MBA program."
        },
        {
          scholarshipName: "Cambridge Research Grant",
          universityName: "Cambridge University",
          universityImage: "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=800",
          universityCountry: "UK",
          universityCity: "Cambridge",
          universityWorldRank: 4,
          subjectCategory: "Medicine",
          scholarshipCategory: "Full fund",
          degree: "Diploma",
          tuitionFees: 0,
          applicationFees: 45,
          serviceCharge: 8,
          applicationDeadline: "2025-08-10",
          scholarshipPostDate: new Date().toISOString(),
          postedUserEmail: "admin@scholarstream.com",
          scholarshipDescription: "Research grant for medical diploma students."
        },
        {
          scholarshipName: "Tokyo Tech Innovation Award",
          universityName: "Tokyo University",
          universityImage: "https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=800",
          universityCountry: "Japan",
          universityCity: "Tokyo",
          universityWorldRank: 23,
          subjectCategory: "Engineering",
          scholarshipCategory: "Partial",
          degree: "Bachelor",
          tuitionFees: 15000,
          applicationFees: 40,
          serviceCharge: 10,
          applicationDeadline: "2025-04-30",
          scholarshipPostDate: new Date().toISOString(),
          postedUserEmail: "admin@scholarstream.com",
          scholarshipDescription: "Innovation scholarship for engineering undergraduates."
        },
        {
          scholarshipName: "Australian Excellence Program",
          universityName: "Melbourne University",
          universityImage: "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=800",
          universityCountry: "Australia",
          universityCity: "Melbourne",
          universityWorldRank: 33,
          subjectCategory: "Agriculture",
          scholarshipCategory: "Self-fund",
          degree: "Masters",
          tuitionFees: 35000,
          applicationFees: 55,
          serviceCharge: 12,
          applicationDeadline: "2025-09-01",
          scholarshipPostDate: new Date().toISOString(),
          postedUserEmail: "admin@scholarstream.com",
          scholarshipDescription: "Self-funded program with partial fee waiver options."
        },
        {
          scholarshipName: "German Engineering Fellowship",
          universityName: "TU Munich",
          universityImage: "https://images.unsplash.com/photo-1592280771190-3e2e4d571952?w=800",
          universityCountry: "Germany",
          universityCity: "Munich",
          universityWorldRank: 50,
          subjectCategory: "Engineering",
          scholarshipCategory: "Full fund",
          degree: "Masters",
          tuitionFees: 0,
          applicationFees: 30,
          serviceCharge: 5,
          applicationDeadline: "2025-06-15",
          scholarshipPostDate: new Date().toISOString(),
          postedUserEmail: "admin@scholarstream.com",
          scholarshipDescription: "Fully funded fellowship for international engineering students."
        },
        {
          scholarshipName: "Singapore Global Scholarship",
          universityName: "NUS Singapore",
          universityImage: "https://images.unsplash.com/photo-1565967511849-76a60a516170?w=800",
          universityCountry: "Singapore",
          universityCity: "Singapore",
          universityWorldRank: 11,
          subjectCategory: "Computer Science",
          scholarshipCategory: "Full fund",
          degree: "Bachelor",
          tuitionFees: 0,
          applicationFees: 65,
          serviceCharge: 15,
          applicationDeadline: "2025-03-31",
          scholarshipPostDate: new Date().toISOString(),
          postedUserEmail: "admin@scholarstream.com",
          scholarshipDescription: "Full scholarship for outstanding CS students from Asia."
        }
      ];

      const result = await scholarshipsCollection.insertMany(sampleScholarships);
      res.json({ message: 'Sample scholarships created!', insertedCount: result.insertedCount });
    });

    // Start Server
    app.listen(port, () => {
      console.log(`ScholarStream Server running on port ${port}`);
    });

  } catch (error) {
    console.error('MongoDB connection error:', error);
  }
}

run().catch(console.dir);

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});
