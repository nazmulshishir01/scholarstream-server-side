# ScholarStream - Server

Backend API server for ScholarStream scholarship management platform.

## 🌐 Live Demo

- **Server:** [https://scholarstream-server.vercel.app](https://scholarstream-server.vercel.app)
- **Client:** [https://scholarstreambd.web.app)

## ✨ Features

- **JWT Authentication** with role-based access control
- **MongoDB Atlas** database integration
- **Stripe** payment processing
- **RESTful API** design
- **Middleware** for token verification, admin/moderator routes
- **Serverless** deployment ready (Vercel)

## 🛠️ Tech Stack

- **Node.js** with Express
- **MongoDB** with native driver
- **JWT** for authentication
- **Stripe** for payments
- **CORS** enabled

## 📦 Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/scholarstream-server.git
cd scholarstream-server
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file (copy from `.env.example`):
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/scholarstream
ACCESS_TOKEN_SECRET=your_jwt_secret_key
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
PORT=5000
```

4. Start development server:
```bash
npm run dev
```

## 🔌 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/jwt` | Generate JWT token |

### Users
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/users` | Create new user | - |
| GET | `/users` | Get all users | Admin |
| GET | `/users/role/:email` | Get user role | Token |
| PATCH | `/users/:id/role` | Update user role | Admin |
| DELETE | `/users/:id` | Delete user | Admin |

### Scholarships
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/scholarships` | Get all with filters | - |
| GET | `/scholarships/top` | Get top scholarships | - |
| GET | `/scholarships/categories` | Get filter options | - |
| GET | `/scholarships/:id` | Get single scholarship | - |
| GET | `/scholarships/related/:category/:id` | Get related | - |
| POST | `/scholarships` | Create scholarship | Admin |
| PUT | `/scholarships/:id` | Update scholarship | Admin |
| DELETE | `/scholarships/:id` | Delete scholarship | Admin |

### Applications
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/applications/all` | Get all applications | Moderator |
| GET | `/applications/user/:email` | Get user applications | Token |
| POST | `/applications` | Create application | Token |
| PATCH | `/applications/:id/status` | Update status | Moderator |
| PATCH | `/applications/:id/feedback` | Add feedback | Moderator |
| DELETE | `/applications/:id` | Delete application | Token |

### Reviews
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/reviews` | Get all reviews | - |
| GET | `/reviews/scholarship/:id` | Get scholarship reviews | - |
| GET | `/reviews/user/:email` | Get user reviews | Token |
| POST | `/reviews` | Create review | Token |
| PUT | `/reviews/:id` | Update review | Token |
| DELETE | `/reviews/:id` | Delete review | Token |

### Payments
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/create-payment-intent` | Create Stripe intent | Token |
| POST | `/payments` | Save payment record | Token |
| GET | `/payments/user/:email` | Get user payments | Token |

### Analytics
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/analytics` | Get platform statistics | Admin |

## 🚀 Deployment (Vercel)

1. Install Vercel CLI:
```bash
npm install -g vercel
```

2. Login to Vercel:
```bash
vercel login
```

3. Deploy:
```bash
vercel --prod
```

4. Add environment variables in Vercel dashboard.

## 📁 Project Structure

```
├── index.js           # Main server file
├── package.json       # Dependencies
├── vercel.json        # Vercel configuration
├── .env.example       # Environment variables template
└── README.md          # Documentation
```

## 🔐 Security

- JWT token verification on protected routes
- Admin middleware for admin-only routes
- Moderator middleware for moderator+ routes
- CORS configured for specific origins
- Environment variables for sensitive data

## 📄 License

MIT License

---

**Built with ❤️ for ScholarStream**
