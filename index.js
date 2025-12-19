const express = require('express');
const cors = require('cors');
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
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

    app.get('/users/:email/role', verifyFBToken, async (req, res) => {
      const email = req.params.email;
      const query = { email }
      const user = await usersCollection.findOne(query);
      res.send({ role: user?.role || 'student' })
    })


    // app.get('/users', verifyFBToken, async (req, res) => {
    //   const cursor = usersCollection.find();
    //   const result = await cursor.toArray();
    //   res.send(result);
    // });

    // users related apis
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

    app.patch('/updateUser/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const updatedInfo = req.body;

      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedInfo }
      );

      res.send(result);
    });



    app.delete('/users/:id', verifyFBToken, verifyAdmin,  async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }

      const result = await usersCollection.deleteOne(query);
      res.send(result);
    })




    // tuition post 
    app.post('/tuitionlist', verifyStudent, async (req, res) => {
      const tuitionPost = req.body;
      rider.status = 'pending';
      rider.createdAt = new Date();

      const result = await tuitionCollection.insertOne(tuitionPost);
      res.send(result);
    })

    app.get('/tuitionlist', async (req, res) => {
      const cursor = tuitionCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    })

    //   app.get('/tuitionlist/:tuitionId', async (req, res) => {
    //   const tuitionId = req.params.trackingId;
    //   const query = { tuitionId };
    //   const result = await tuitionCollection.find(query).toArray();
    //   res.send(result);
    // })





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