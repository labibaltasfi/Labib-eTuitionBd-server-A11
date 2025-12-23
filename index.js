const express = require('express');
const cors = require('cors');
require('dotenv').config();
var jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const app = express();
const port = process.env.PORT || 3000;


const admin = require("firebase-admin");


const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});





// middleware
app.use(cors());
app.use(express.json());

const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' })
  }

  try {
    const idToken = token.split(' ')[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    console.log('decoded in the token', decoded);
    req.decoded_email = decoded.email;
    next();
  }
  catch (err) {
    return res.status(401).send({ message: 'unauthorized access' })
  }
}


const verifyJWTToken = (req, res, next) => {
  console.log('in middleware', req.headers)
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ message: 'unauthorized access' })
  }
  const token = authorization.split(' ')[1];
  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' })
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'unauthorized access' })
    }

    //put it in the right place
    console.log('after decoded', decoded)
    req.token_email = decoded.email;
    next();
  })

}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@labibaltasfi.wgwi0xd.mongodb.net/?appName=LabibAlTasfi`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});




async function run() {
  try {
    // await client.connect();
    const db = client.db('eTutionbd_db');
    const usersCollection = db.collection('users');
    const tuitionCollection = db.collection('tuitionlist');
    const applicationsCollection = db.collection('tutorApplications');
    const paymentCollection = db.collection('payments');


    //jwt related api
    app.post('/getToken', (req, res) => {
      const loggedUser = req.body;
      const token = jwt.sign(loggedUser, process.env.JWT_SECRET, { expiresIn: '1h' })
      res.send({ token: token })
    })


    // middle student before allowing student activity
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await usersCollection.findOne(query);

      if (!user || user.role !== 'admin') {
        return res.status(403).send({ message: 'forbidden access' });
      }

      next();
    }


    const verifyStudent = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await usersCollection.findOne(query);

      if (!user || user.role !== 'student') {
        return res.status(403).send({ message: 'forbidden access' });
      }

      next();
    }

    const verifyTutor = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await usersCollection.findOne(query);

      if (!user || user.role !== 'student') {
        return res.status(403).send({ message: 'forbidden access' });
      }

      next();
    }

    // USERS APIs
    app.post('/users', async (req, res) => {
      const newUser = req.body;
      const email = req.body.email;
      const query = { email: email }
      const existingUser = await usersCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: 'user already exists' });
      }

      else {
        const result = await usersCollection.insertOne(newUser);
        res.send(result);
      }
    })

    app.get('/users/by-email', async (req, res) => {
      const email = req.query.email;

      const user = await usersCollection.findOne({ email });
      res.send(user);
    });


    app.delete('/users/:id', verifyFBToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }

      const result = await usersCollection.deleteOne(query);
      res.send(result);
    })


    app.get('/users/:email/role', verifyFBToken, async (req, res) => {
      const email = req.params.email;
      const query = { email }
      const user = await usersCollection.findOne(query);
      res.send({ role: user?.role || 'student' })
    })



    app.get('/users', verifyFBToken, verifyAdmin, async (req, res) => {
      try {
        const searchText = req.query.searchText || '';
        const query = {};

        if (searchText) {
          query.$or = [
            { displayName: { $regex: searchText, $options: 'i' } },
            { email: { $regex: searchText, $options: 'i' } },
          ];
        }

        const result = await usersCollection
          .find(query)
          .sort({ createdAt: -1 })
          .limit(5)
          .toArray();

        res.send(result);
      } catch (error) {
        console.error('GET /users ERROR:', error);
        res.status(500).send({ message: 'Internal server error' });
      }
    });

    app.patch('/users/:id/role', verifyFBToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const roleInfo = req.body;
      const query = { _id: new ObjectId(id) }
      const updatedDoc = {
        $set: {
          role: roleInfo.role
        }
      }
      const result = await usersCollection.updateOne(query, updatedDoc)
      res.send(result);
    })

    app.get('/updateUser/:id', async (req, res) => {
      const id = req.params.id;
      const result = await usersCollection.findOne({
        _id: new ObjectId(id)
      });
      res.send(result);
    })

    app.patch('/updateUser/:id', verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const updatedInfo = req.body;

      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedInfo }
      );

      res.send(result);
    });





    // tuition post 
    app.post('/tuitionlist', async (req, res) => {
      const tuitionPost = req.body;
      tuitionPost.status = 'pending';
      tuitionPost.paymentStatus = 'unpaid';
      tuitionPost.createdAt = new Date();

      const result = await tuitionCollection.insertOne(tuitionPost);
      res.send(result);
    })

    app.get('/tuitionlist', async (req, res) => {
      const cursor = tuitionCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    })

    app.patch('/tuitionlist/:id', verifyFBToken, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;

        const result = await tuitionCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status, updatedAt: new Date() } }
        );

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Status update failed' });
      }
    });

    app.get('/tuitionlist', verifyFBToken, async (req, res) => {
      try {
        const result = await tuitionCollection.find({}).toArray();
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Failed to fetch tuition list' });
      }
    });

    app.get('/tuitionlist/approved', async (req, res) => {
      try {
        const result = await tuitionCollection.find({
          status: 'approved',
          paymentStatus: 'unpaid',
        }).toArray();

        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Failed to fetch approved unpaid tuitions' });
      }
    });




    app.get('/tuitionlist/:tuitionId', async (req, res) => {
      const id = req.params.tuitionId;
      const result = await tuitionCollection.findOne({
        _id: new ObjectId(id)
      });
      res.send(result);
    })

    app.post("/applications", async (req, res) => {
      const application = req.body;


      const query = {
        tutorEmail: application.tutorEmail,
        tuitionId: application.tuitionId
      };

      const alreadyApplied = await applicationsCollection.findOne(query);

      if (alreadyApplied) {
        return res.status(400).send({
          message: "You have already applied for this tuition post!"
        });
      }

      const result = await applicationsCollection.insertOne({
        ...application,
        appliedAt: new Date(),
      });

      res.send(result);
    });

    app.get('/applications/by-id/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await applicationsCollection.findOne(query);
      res.send(result);
    });

    app.get('/applications/check', async (req, res) => {
      const { email, tuitionId } = req.query;

      try {

        const query = {
          tutorEmail: email,
          tuitionId: tuitionId
        };

        const application = await applicationsCollection.findOne(query);


        res.send({ applied: !!application, details: application });
      } catch (error) {
        res.status(500).send({ message: "Error checking application" });
      }
    });





    app.get("/applications/:tuitionId", async (req, res) => {
      const id = req.params.tuitionId;

      const query = { tuitionId: id };

      const applications = await applicationsCollection
        .find(query)
        .toArray();

      res.send(applications);
    });


    app.get("/tuitions-with-applications", async (req, res) => {
      const tuitions = await tuitionCollection.find({}).toArray();

      const result = await Promise.all(
        tuitions.map(async (tuition) => {
          const applications = await applicationsCollection
            .find({ tuitionId: tuition._id.toString() })
            .toArray();
          return { tuition, applications };
        })
      );

      res.json(result);
    });


    //  tutor-revenue
    app.get('/tutor-revenue', async (req, res) => {
      const email = req.query.email;

      if (!email) return res.status(400).send({ message: "Email is required" });

      try {
        const payments = await paymentCollection
          .find({ tutorEmail: email, paymentStatus: 'paid' })
          .sort({ paidAt: -1 }) // just paidAt
          .toArray();

        let totalGross = 0;
        let totalNet = 0;

        const history = payments.map(pay => {
          const amount = parseFloat(pay.amount);
          const netEarnings = amount * 0.8; // 80%
          totalGross += amount;
          totalNet += netEarnings;

          return {
            _id: pay._id,
            paidAt: pay.paidAt,
            studentName: pay.studentName,
            studentEmail: pay.studentEmail,
            transactionId: pay.transactionId,
            amount,
            tutorNet: netEarnings.toFixed(2),
            currency: pay.currency,
          };
        });   

        res.send({
          history,
          totals: {
            totalGross: totalGross.toFixed(2),
            totalNet: totalNet.toFixed(2)
          }
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Internal Server Error", error });
      }
    });





    app.get("/tuitions-with-applications/by-tutor", async (req, res) => {
      const email = req.query.email;

      if (!email) {
        return res.status(400).send({ message: "Email is required" });
      }

      try {

        const query = { studentEmail: email };
        const tuitions = await tuitionCollection.find(query).toArray();


        const result = await Promise.all(
          tuitions.map(async (tuition) => {
            const applications = await applicationsCollection
              .find({ tuitionId: tuition._id.toString() })
              .toArray();

            return {
              ...tuition,
              applications
            };
          })
        );

        res.json(result);
      } catch (error) {
        res.status(500).send({ message: "Server Error", error });
      }
    });

    app.get("/my-applications", async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) return res.status(400).send({ message: "Email is required" });

        const query = { tutorEmail: email };
        const result = await applicationsCollection.find(query).toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Internal Server Error" });
      }
    });


    // DELETE Application
    app.delete('/my-applications/:id', async (req, res) => {
      const id = req.params.id;
      const email = req.query.email;

      const query = { _id: new ObjectId(id), tutorEmail: email };
      const application = await applicationsCollection.findOne(query);

      if (!application) {
        return res.status(404).send({ message: "Application not found" });
      }


      if (application.status !== 'pending') {
        return res.status(403).send({ message: "Cannot delete an approved/rejected request" });
      }

      const result = await applicationsCollection.deleteOne(query);
      res.send(result);
    });


    app.patch('/my-applications/:id', async (req, res) => {
      const id = req.params.id;
      const { expectedSalary, experience, email } = req.body;

      const query = { _id: new ObjectId(id), tutorEmail: email };

      const updateDoc = {
        $set: {
          expectedSalary: expectedSalary,
          experience: experience
        }
      };

      try {
        const result = await applicationsCollection.updateOne(query, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to update" });
      }
    });






    app.post('/payment-checkout-session', async (req, res) => {
      try {
        const { expectedSalary, applicationId, tutorEmail, tutorName, trackingId, studentName, studentEmail, tuitionId } = req.body;

        if (!expectedSalary || !applicationId) {
          return res.status(400).send({ message: "Missing fields" });
        }

        const amount = Number(expectedSalary) * 100;
        if (isNaN(amount) || amount <= 0) {
          return res.status(400).send({ message: "Invalid amount" });
        }

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          mode: 'payment',
          line_items: [
            {
              price_data: {
                currency: 'bdt',
                unit_amount: amount,
                product_data: { name: `Please pay for: ${tutorName}` },
              },
              quantity: 1,
            },
          ],
          metadata: {
            applicationId: applicationId.toString(),
            tuitionId: tuitionId.toString(),
            tutorEmail: tutorEmail?.toString() || "",
            tutorName: tutorName?.toString() || "",
            studentName: studentName?.toString() || "",
            studentEmail: studentEmail?.toString() || "",
            trackingId: trackingId?.toString() || "",
          },
          success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
        });

        res.send({ url: session.url });
      } catch (error) {
        console.error("Stripe Error:", error.message);
        res.status(400).send({ message: error.message });
      }
    });



    app.patch('/payment-success', async (req, res) => {
      try {
        const sessionId = req.query.session_id;
        if (!sessionId) {
          return res.status(400).send({ message: "session_id required" });
        }

        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status !== 'paid') {
          return res.status(400).send({ message: "Payment not completed" });
        }

        const transactionId = session.payment_intent;


        const existingPayment = await paymentCollection.findOne({ transactionId });
        if (existingPayment) {
          return res.send({
            success: true,
            message: 'already exists',
            transactionId,
            trackingId: existingPayment.trackingId
          });
        }

        const applicationId = session.metadata?.applicationId;
        const tuitionId = session.metadata?.tuitionId;
        const trackingId = session.metadata?.trackingId;
        const tutorEmail = session.metadata?.tutorEmail || "";
        const tutorName = session.metadata?.tutorName || "";
        const studentName = session.metadata?.studentName || "";
        const studentEmail = session.metadata?.studentEmail || "";

        if (!applicationId) {
          return res.status(400).send({ message: "Missing applicationId" });
        }


        const updateResult = await applicationsCollection.updateOne(
          { _id: new ObjectId(applicationId) },
          { $set: { status: 'approved' } }
        );

        const updateTuitionResult = await tuitionCollection.updateOne(
          { _id: new ObjectId(tuitionId) },
          {
            $set: {
              paymentStatus: "paid",
              paidAt: new Date()
            }
          }
        );

        // payment related apis
        app.get('/payments', async (req, res) => {
          const email = req.query.email;
          const query = {}

          if (email) {
            query.studentEmail = email;

            // check email address
            if (email !== req.decoded_email) {
              return res.status(403).send({ message: 'forbidden access' })
            }
          }
          const cursor = paymentCollection.find(query).sort({ paidAt: -1 });
          const result = await cursor.toArray();
          res.send(result);
        })




        const payment = {
          amount: session.amount_total / 100,
          currency: session.currency,
          studentName,
          studentEmail,
          tutorEmail,
          tutorName,
          applicationId,
          tuitionId,
          transactionId,
          paymentStatus: session.payment_status,
          paidAt: new Date(),
          trackingId
        };

        const paymentResult = await paymentCollection.insertOne(payment);

        return res.send({
          success: true,
          modifyApplication: updateResult,
          modifyTuitionList: updateTuitionResult,
          transactionId,
          trackingId,
          paymentInfo: paymentResult
        });

      } catch (error) {
        console.error("PATCH /payment-success error:", error);
        return res.status(500).send({ message: error.message });
      }
    });


    app.get('/payments', async (req, res) => {
      const email = req.query.email;
      const query = {}

      // console.log( 'headers', req.headers);

      if (email) {
        query.studentEmail = email;

        // check email address
      }
      const cursor = paymentCollection.find(query).sort({ paidAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    })




    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('eTutionbd server is running')
})

app.listen(port, () => {
  console.log(`eTutionbd server is running on port: ${port}`)
})