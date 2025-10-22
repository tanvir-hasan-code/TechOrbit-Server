const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const admin = require("firebase-admin");
const port = process.env.PORT || 3000;

// middleWares
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());
const stripe = require("stripe")(process.env.PAYMENT_GATEWAY_KEY);
// console.log("Stripe key:", process.env.PAYMENT_GATEWAY_KEY);

// Firebase Admin Key

const serviceAccount = require("./techOrbit-firebase-admin-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { database } = require("firebase-admin");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ot8ggjo.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const dataBase = client.db("TechOrbitDB");
    const userCollection = dataBase.collection("users");
    const productCollections = dataBase.collection("products");
    const commentsCollections = dataBase.collection("comment");
    const reportsCollections = dataBase.collection("report");
    const ratingsCollections = dataBase.collection("ratings");
    const couponCollections = dataBase.collection("coupons");

    // Middleware

    const VerifyFBToken = async (req, res, next) => {
      const authHeader = req?.headers.authorization;
      if (!authHeader) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      const Token = authHeader.split(" ")[1];
      if (!Token) {
        return res.status(401).send({ message: "unauthorize access" });
      }

      // verify Token

      try {
        const decoded = await admin.auth().verifyIdToken(Token);
        req.decoded = decoded;
        next();
      } catch (err) {
        return res.status(403).send({ message: "forbidden access" });
      }
    };

    // 🛡️ verifyParamsEmail.js
    const verifyParamsEmail = async (req, res, next) => {
      try {
        if (req.params.email !== req.decoded?.email) {
          return res.status(403).json({ message: "Forbidden access!" });
        }
        next();
      } catch (error) {
        console.error("verifyParamsEmail Error:", error);
        res.status(500).json({ message: "Internal server error!" });
      }
    };


    const verifyQueryEmail = async (req, res, next) => {
      try {
        if (req.query.email !== req.decoded?.email) {
          return res.status(403).json({ message: "Forbidden access!" });
        }
        next();
      } catch (error) {
        console.error("verifyParamsEmail Error:", error);
        res.status(500).json({ message: "Internal server error!" });
      }
    };

    // 🛡️ AdminAndModeratorVerify.js
    const AdminAndModeratorVerify = async (req, res, next) => {
      try {
        const email = req.decoded?.email;

        if (!email) {
          return res
            .status(401)
            .json({ message: "Unauthorized: Email not found in token!" });
        }

        const emailRole = await userCollection.findOne({ email });

        if (!emailRole) {
          return res.status(404).json({ message: "User not found!" });
        }

        if (!["admin", "moderator"].includes(emailRole.role)) {
          return res
            .status(403)
            .json({
              message: "Access denied! Only admin or moderator allowed.",
            });
        }

        next();
      } catch (error) {
        console.error("AdminAndModeratorVerify Error:", error);
        res.status(500).json({ message: "Internal server error!" });
      }
    };

    // 🛡️ AdminVerify.js
    const AdminVerify = async (req, res, next) => {
      try {
        const email = req.decoded?.email;

        if (!email) {
          return res
            .status(401)
            .json({ message: "Unauthorized: Email not found in token!" });
        }

        const adminRole = await userCollection.findOne({ email });

        if (!adminRole) {
          return res.status(404).json({ message: "User not found!" });
        }

        if (adminRole.role !== "admin") {
          return res
            .status(403)
            .json({ message: "Access denied! Admins only." });
        }

        next();
      } catch (error) {
        console.error("AdminVerify Error:", error);
        res.status(500).json({ message: "Internal server error!" });
      }
    };

    app.get("/", (req, res) => {
      res.send("TechOrbit Project Root Page!");
    });

    //   user manage apis

    app.post("/user", async (req, res) => {
      const profile = req.body;

      const email = profile.email;
      const user = await userCollection.findOne({ email });

      if (!email) {
        return res
          .status(400)
          .json({ success: false, message: "Email is required" });
      }

      if (user) {
        return res.status(200).json({
          success: true,
          message: "User already exists",
          data: user,
        });
      }

      const newUser = { ...profile, isVerified: false };

      const result = await userCollection.insertOne(newUser);
      res.status(201).json({
        success: true,
        message: "User created successfully",
        data: result,
      });
    });

    // single User Get

    app.get("/user/:email", VerifyFBToken, verifyParamsEmail, async (req, res) => {
      const { email } = req.params;

      if (!email) {
        res.status(404).send({ message: "Email not Found!" });
      }

      const query = { email };
      const result = await userCollection.findOne(query);

      if (!result) {
        res.status(404).send({ message: "User Not Found!" });
      }
      res.send(result);
    });

    // 🔹 Search users by email regex
    app.get("/users", VerifyFBToken, AdminVerify, async (req, res) => {
      try {
        const email = req.query.email;
        const query = email ? { email: { $regex: email, $options: "i" } } : {};
        const users = await userCollection.find(query).toArray();
        res.send(users);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to fetch users" });
      }
    });

    // 🔹 Update role
    app.patch("/users/:email/role",VerifyFBToken, AdminVerify, async (req, res) => {
      try {
        const email = req.params.email;

        const { role } = req.body;
        const filter = { email };
        const update = { $set: { role } };

        const result = await userCollection.updateOne(filter, update);

        if (result.matchedCount === 0) {
          return res
            .status(404)
            .json({ success: false, message: "User not found" });
        }

        res.json(result);
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server error" });
      }
    });

    // Products API
    // GET /products?page=1&limit=6&search=video
    app.get("/products", async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 6;
        const skip = (page - 1) * limit;
        const search = req.query.search || "";

        const query = {
          status: "published",
          ...(search ? { tags: { $regex: search, $options: "i" } } : {}),
        };

        const total = await productCollections.countDocuments(query);
        const products = await productCollections
          .find(query)
          .skip(skip)
          .limit(limit)
          .toArray();

        res.send({ total, products });
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .send({ success: false, message: "Failed to fetch products" });
      }
    });

    app.post("/product",VerifyFBToken, async (req, res) => {
      try {
        const productData = req.body;
        const ownerEmail = productData.ownerEmail;


        if (!ownerEmail) {
          return res
            .status(400)
            .json({ success: false, message: "Owner email required" });
        }

        if (ownerEmail !== req.decoded?.email) {
          return res.status(403).send({message: "forbidden access"})
        }

        const user = await userCollection.findOne({ email: ownerEmail });

        if (!user) {
          return res
            .status(404)
            .json({ success: false, message: "User not found" });
        }

        if (!user.isVerified) {
          const productCount = await productCollections.countDocuments({
            ownerEmail,
          });

          if (productCount >= 1) {
            return res.status(403).json({
              success: false,
              message:
                "Free users can only add one product. Upgrade to premium to add more.",
            });
          }
        }

        const result = await productCollections.insertOne({
          ...productData,
          createdAt: new Date(),
        });

        res.send(result);
      } catch (error) {
        console.error("Error adding product:", error);
        res.status(500).json({
          success: false,
          message: "Server Error",
          error: error.message,
        });
      }
    });

    // Pending Products

    // ✅ Get all pending products
    app.get("/products/pending", VerifyFBToken, AdminAndModeratorVerify, async (req, res) => {
      try {
        const query = { status: "pending" };

        const products = await productCollections
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).json({
          success: true,
          message: "Pending products fetched successfully",
          count: products.length,
          data: products,
        });
      } catch (error) {
        console.error("Error fetching pending products:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch pending products",
          error: error.message,
        });
      }
    });

    // ✅ Update product status (publish or decline)
    app.patch("/product/:id/status", VerifyFBToken, AdminAndModeratorVerify, async (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body;

        if (!["pending", "published", "declined"].includes(status)) {
          return res
            .status(400)
            .json({ success: false, message: "Invalid status" });
        }

        const filter = { _id: new ObjectId(id) };
        const update = { $set: { status } };

        const result = await productCollections.updateOne(filter, update);

        if (result.matchedCount === 0) {
          return res
            .status(404)
            .json({ success: false, message: "Product not found" });
        }

        res.json({
          success: true,
          message: `Product status updated to ${status}`,
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server error" });
      }
    });

    // Products Details page and Comment API

    // Get single product
    app.get("/product/details/:id", async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const product = await productCollections.findOne(query);

      if (!product) {
        return res.status(404).send({ message: "Product not found" });
      }

      res.send(product);
    });

    // My Products API

    app.get("/product/myProducts/:email", VerifyFBToken, verifyParamsEmail, async (req, res) => {
      const { email } = req.params;

      if (!email) {
        res.status(403).status({ message: "Email Not Found!" });
      }
      const products = await productCollections
        .find({ ownerEmail: email })
        .sort({ createdAt: -1 })
        .toArray();

      if (!products) {
        res.status(404).send({ message: "Data Not Found!" });
      }

      res.send(products);
    });

    // ✅ PATCH - Update Product Info
    app.patch("/product/update/:id", VerifyFBToken, async (req, res) => {
      try {
        const { id } = req.params;
        const updateData = req.body;

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            productName: updateData.productName,
            productImage: updateData.productImage,
            description: updateData.description,
            tags: updateData.tags,
            externalLink: updateData.externalLink,
            updatedAt: new Date(),
          },
        };

        const result = await productCollections.updateOne(filter, updateDoc);

        if (result.matchedCount === 0) {
          return res
            .status(404)
            .json({ success: false, message: "Product not found" });
        }

        res.json({ success: true, message: "Product updated successfully" });
      } catch (error) {
        console.error("Error updating product:", error);
        res
          .status(500)
          .json({ success: false, message: "Failed to update product" });
      }
    });

    // ✅ Delete Product by ID
    app.delete("/product/:id", VerifyFBToken, async (req, res) => {
      try {
        const { id } = req.params;
        const result = await productCollections.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res
            .status(404)
            .json({ success: false, message: "Product not found" });
        }

        res
          .status(200)
          .json({ success: true, message: "Product deleted successfully" });
      } catch (error) {
        res
          .status(500)
          .json({ success: false, message: "Server Error", error });
      }
    });

    // Get all comments for a product
    app.get("/comments/:id",VerifyFBToken, async (req, res) => {
      const comments = await commentsCollections
        .find({ productId: req.params.id })
        .sort({ createdAt: -1 })
        .toArray();
      res.send({ data: comments });
    });

    // Post a new comment
    app.post("/comments/:id", async (req, res) => {
      const newComment = req.body;
      const result = await commentsCollections.insertOne(newComment);
      res.send(result);
    });

    // ✅ PATCH - Like / Dislike toggle
    app.patch("/product/vote/:id", VerifyFBToken, async (req, res) => {
      const { userEmail, type } = req.body;
      const id = req.params.id;

      const product = await productCollections.findOne({
        _id: new ObjectId(id),
      });
      if (!product)
        return res.status(404).send({ message: "Product not found" });

      let upVotes = product.upVotes || [];
      let downVotes = product.downVotes || [];

      if (type === "up") {
        if (upVotes.includes(userEmail)) {
          upVotes = upVotes.filter((e) => e !== userEmail); // toggle off
        } else {
          upVotes.push(userEmail);
          downVotes = downVotes.filter((e) => e !== userEmail);
        }
      } else if (type === "down") {
        if (downVotes.includes(userEmail)) {
          downVotes = downVotes.filter((e) => e !== userEmail); // toggle off
        } else {
          downVotes.push(userEmail);
          upVotes = upVotes.filter((e) => e !== userEmail);
        }
      }

      await productCollections.updateOne(
        { _id: new ObjectId(id) },
        { $set: { upVotes, downVotes } }
      );

      res.send({ success: true, upVotes, downVotes });
    });

    // ✅ PATCH - Report toggle (save/remove from reports collection)
    app.patch("/product/report/:id", VerifyFBToken, async (req, res) => {
      const { userEmail, userName, userPhoto } = req.body;
      const id = req.params.id;

      const product = await productCollections.findOne({
        _id: new ObjectId(id),
      });
      if (!product)
        return res.status(404).send({ message: "Product not found" });

      // Check if already reported by this user
      const existingReport = await reportsCollections.findOne({
        productId: id,
        userEmail,
      });

      if (existingReport) {
        // Remove report (toggle off)
        await reportsCollections.deleteOne({ _id: existingReport._id });
        return res.send({ success: true, reported: false });
      } else {
        // Add new report
        const newReport = {
          productId: id,
          userEmail,
          userName,
          userPhoto,
          createdAt: new Date(),
        };

        await reportsCollections.insertOne(newReport);
        await productCollections.updateOne(
          { _id: new ObjectId(id) },
          { $set: { isReported: true } }
        );

        return res.send({ success: true, reported: true });
      }
    });

    // ✅ Get all reports for a specific product

    app.get("/reported-products", VerifyFBToken, AdminAndModeratorVerify, async (req, res) => {
      try {
        const reportedProducts = await reportsCollections
          .aggregate([
            { $sort: { createdAt: -1 } },
            {
              $group: {
                _id: "$productId", // unique productId
                latestReport: { $last: "$$ROOT" },
              },
            },
            {
              $project: {
                productId: "$_id",
                _id: 0,
              },
            },
          ])
          .toArray();

        if (reportedProducts.length === 0) {
          return res.status(200).json({
            success: true,
            message: "No reported products found",
            data: [],
          });
        }

        const productIds = reportedProducts.map(
          (r) => new ObjectId(r.productId)
        );

        const products = await productCollections
          .find({ _id: { $in: productIds } })
          .project({
            productName: 1,
            productImage: 1,
            ownerName: 1,
            ownerEmail: 1,
            tags: 1,
            status: 1,
            createdAt: 1,
          })
          .toArray();

        res.status(200).json({
          success: true,
          message: "Reported products fetched successfully",
          count: products.length,
          data: products,
        });
      } catch (error) {
        console.error("Error fetching reported products:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch reported products",
          error: error.message,
        });
      }
    });

    // ✅ Get Reports by Product ID
    app.get("/reported-products/:productId", VerifyFBToken, AdminAndModeratorVerify, async (req, res) => {
      try {
        const { productId } = req.params;

        const product = await productCollections.findOne({
          _id: new ObjectId(productId),
        });

        if (!product) {
          return res.status(404).json({
            success: false,
            message: "Product not found",
          });
        }

        const reports = await reportsCollections
          .find({ productId })
          .sort({ createdAt: -1 })
          .project({
            userName: 1,
            userEmail: 1,
            userPhoto: 1,
            createdAt: 1,
          })
          .toArray();

        res.status(200).json({
          success: true,
          message: "Reports fetched successfully",
          product: {
            _id: product._id,
            productName: product.productName,
            productImage: product.productImage,
          },
          count: reports.length,
          data: reports,
        });
      } catch (error) {
        console.error("Error fetching product reports:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch product reports",
          error: error.message,
        });
      }
    });

    // Rating Collection
    // Get average rating of a product
    app.get("/ratings/:id", VerifyFBToken, async (req, res) => {
      const productId = req.params.id;
      const ratings = await ratingsCollections.find({ productId }).toArray();
      const average =
        ratings.length > 0
          ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
          : 0;
      res.send({ average });
    });

    // Post rating
    app.post("/ratings/:id", async (req, res) => {
      const ratingData = req.body;
      const exists = await ratingsCollections.findOne({
        productId: ratingData.productId,
        userEmail: ratingData.userEmail,
      });
      if (exists) {
        return res.status(400).send({ message: "Already rated" });
      }
      const result = await ratingsCollections.insertOne(ratingData);
      res.send(result);
    });

    // Patch rating
    app.patch("/product/rating/:id", async (req, res) => {
      const productId = req.params.id;
      const { userEmail, rating } = req.body;

      // Check if user already rated
      const exists = await ratingsCollections.findOne({ productId, userEmail });
      if (exists) {
        return res.status(400).send({ message: "Already rated" });
      }

      // Insert rating
      const result = await ratingsCollections.insertOne({
        productId,
        userEmail,
        rating,
        createdAt: new Date(),
      });

      // Calculate average rating
      const ratings = await ratingsCollections.find({ productId }).toArray();
      const average =
        ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;

      res.send({ success: true, result, average });
    });

    // 🧩 ==========================
    // 🔹 USER SETTINGS API
    // 🧩 ==========================

    // ✅ GET: get user settings by email
    app.get("/users/settings/:email", VerifyFBToken, verifyParamsEmail, async (req, res) => {
      try {
        const { email } = req.params;
        if (!email) return res.status(400).json({ message: "Email required" });

        const user = await userCollection.findOne({ email });
        if (!user) return res.status(404).json({ message: "User not found" });

        res.status(200).json({
          success: true,
          message: "Settings fetched successfully",
          theme: user.settings?.theme || "light",
          notifications: user.settings?.notifications ?? true,
          privacy: user.settings?.privacy || "public",
          name: user.name || "",
        });
      } catch (error) {
        console.error("Error fetching settings:", error);
        res.status(500).json({ success: false, message: "Server Error" });
      }
    });

    // ✅ PUT: update user settings
    app.put("/users/settings/:email", VerifyFBToken, verifyParamsEmail, async (req, res) => {
      try {
        const { email } = req.params;
        const { theme, notifications, privacy, name } = req.body;

        if (!email)
          return res
            .status(400)
            .json({ success: false, message: "Email required" });

        const filter = { email };
        const update = {
          $set: {
            name,
            "settings.theme": theme,
            "settings.notifications": notifications,
            "settings.privacy": privacy,
            updatedAt: new Date(),
          },
        };

        const result = await userCollection.updateOne(filter, update, {
          upsert: true,
        });

        res.status(200).json({
          success: true,
          message: "Settings updated successfully",
          result,
        });
      } catch (error) {
        console.error("Error updating settings:", error);
        res.status(500).json({ success: false, message: "Server Error" });
      }
    });

    // ✅ DELETE: delete user account
    app.delete("/users/:email",VerifyFBToken, verifyParamsEmail, async (req, res) => {
      try {
        const { email } = req.params;
        const result = await userCollection.deleteOne({ email });

        if (result.deletedCount === 0)
          return res
            .status(404)
            .json({ success: false, message: "User not found" });

        res
          .status(200)
          .json({ success: true, message: "Account deleted successfully" });
      } catch (error) {
        console.error("Error deleting account:", error);
        res.status(500).json({ success: false, message: "Server Error" });
      }
    });

    // 🟢 COUPON API ROUTES

    app.post("/coupon", VerifyFBToken, AdminVerify, async (req, res) => {
      try {
        const { code, type, value, expiryDate, usageLimit } = req.body;

        //  validation
        if (!code || !type || !value || !expiryDate) {
          return res.status(400).json({
            success: false,
            message: "Missing required fields",
          });
        }

        // Check if coupon code already exists
        const existing = await couponCollections.findOne({ code });
        if (existing) {
          return res.status(400).json({
            success: false,
            message: "Coupon code already exists",
          });
        }

        // Create new coupon
        const newCoupon = {
          code,
          type,
          value,
          expiryDate: new Date(expiryDate),
          usageLimit: usageLimit || null,
          usedCount: 0,
          createdAt: new Date(),
        };

        const result = await couponCollections.insertOne(newCoupon);
        res.status(201).json({
          success: true,
          message: "Coupon created successfully",
          data: result,
        });
      } catch (error) {
        console.error("Error creating coupon:", error);
        res.status(500).json({
          success: false,
          message: "Failed to create coupon",
          error: error.message,
        });
      }
    });

    // 🟡 GET ALL COUPONS
    app.get("/coupons", async (req, res) => {
      try {
        const coupons = await couponCollections
          .find()
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).json(coupons);
      } catch (error) {
        console.error("Error fetching coupons:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch coupons",
          error: error.message,
        });
      }
    });

    // 🔵 DELETE COUPON
    app.delete("/coupons/:id", VerifyFBToken, AdminVerify, async (req, res) => {
      try {
        const { id } = req.params;

        const result = await couponCollections.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Coupon not found",
          });
        }

        res.status(200).json({
          success: true,
          message: "Coupon deleted successfully",
        });
      } catch (error) {
        console.error("Error deleting coupon:", error);
        res.status(500).json({
          success: false,
          message: "Failed to delete coupon",
          error: error.message,
        });
      }
    });

    app.post("/coupons/verify", async (req, res) => {
      try {
        const { code } = req.body;
        const coupon = await couponCollections.findOne({ code });

        if (!coupon) {
          return res.status(404).json({
            success: false,
            message: "Invalid coupon code",
          });
        }

        const now = new Date();
        if (new Date(coupon.expiryDate) < now) {
          return res.status(400).json({
            success: false,
            message: "Coupon has expired",
          });
        }

        if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
          return res.status(400).json({
            success: false,
            message: "Coupon usage limit reached",
          });
        }

        res.status(200).json({
          success: true,
          message: "Coupon is valid",
          data: coupon,
        });
      } catch (error) {
        console.error("Error verifying coupon:", error);
        res.status(500).json({
          success: false,
          message: "Failed to verify coupon",
          error: error.message,
        });
      }
    });

    // payment API

    app.post("/create-payment-intent", VerifyFBToken, async (req, res) => {
      const { amount } = req.body;
      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: "usd",
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    // ✅ Payment Success API
    app.post("/payment-success", VerifyFBToken, async (req, res) => {
      try {
        const { email, couponCode } = req.body;

        if (!email) {
          return res
            .status(400)
            .json({ success: false, message: "Email required" });
        }

        // 1️⃣ Update user isVerified = true
        const userUpdate = await userCollection.updateOne(
          { email },
          { $set: { isVerified: true } }
        );

        if (userUpdate.matchedCount === 0) {
          return res
            .status(404)
            .json({ success: false, message: "User not found" });
        }

        // 2️⃣ Handle coupon update if couponCode exists
        if (couponCode) {
          const coupon = await couponCollections.findOne({ code: couponCode });

          if (!coupon) {
            return res
              .status(404)
              .json({ success: false, message: "Coupon not found" });
          }

          // Check usage limit
          if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
            return res
              .status(400)
              .json({ success: false, message: "Coupon usage limit reached" });
          }

          // Increment usedCount
          await couponCollections.updateOne(
            { code: couponCode },
            { $inc: { usedCount: 1 } }
          );
        }

        res.status(200).json({
          success: true,
          message:
            "Payment processed successfully, user verified, coupon updated",
        });
      } catch (error) {
        console.error("Payment success error:", error);
        res.status(500).json({
          success: false,
          message: "Server error",
          error: error.message,
        });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`http://localhost:${port}`);
});
