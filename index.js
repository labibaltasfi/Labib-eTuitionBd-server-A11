const express = require('express');
const cors = require('cors');
require('dotenv').config();
var jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const app = express();
const port = process.env.PORT || 3000;


const admin = require("firebase-admin");

const serviceAccount = require("./labib-etuitionbd-a11-firebase-admin.json");

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


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@labibaltasfi.wgwi0xd.mongodb.net/?appName=LabibAlTasfi`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});



app.get('/', (req, res) => {
  res.send('eTutionbd server is running')
})


async function run() {
  try {
    await client.connect();
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

    app.patch('/updateUser/:id', verifyFBToken, verifyAdmin, async (req, res) => {
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

    app.get('/tuitionlist/approved', verifyFBToken, async (req, res) => {
      try {
        const result = await tuitionCollection
          .find({ status: 'approved' })
          .toArray();

        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Failed to fetch approved tuitions' });
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
    })



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




    // payment related apis
    app.post('/payment-checkout-session', async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.expectedSalary) * 100;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: 'BDT',
              unit_amount: amount,
              product_data: {
                name: `Please pay for: ${paymentInfo.tutorName}`
              }
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        metadata: {
          applicationId: paymentInfo.applicationId,
        },
        TutorEmail_email: paymentInfo.tutorEmail,
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
      })

      res.send({ url: session.url })
    })


     app.patch('/payment-success', async (req, res) => {
            const sessionId = req.query.session_id;
            const session = await stripe.checkout.sessions.retrieve(sessionId);

            if (session.payment_status === 'paid') {
                const id = session.metadata.applicationId;
                const query = { _id: new ObjectId(id) }
                const update = {
                    $set: {
                        status: 'paid',
                    }
                }

                const result = await applicationsCollection.updateOne(query, update);

                   const payment = {
                    amount: session.amount_total / 100,
                    currency: session.currency,
                    TutorEmail: session.TutorEmail,
                    applicationId: session.metadata.applicationId,
                    tutorName: session.metadata.tutorName,
                    transactionId: session.payment_intent,
                    paymentStatus: session.payment_status,
                    paidAt: new Date(),
                }

                if (session.payment_status === 'paid') {
                    const resultPayment = await paymentCollection.insertOne(payment);

            }
          }

           return res.send({ success: false })
        })








    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);


app.listen(port, () => {
  console.log(`eTutionbd server is running on port: ${port}`)
})