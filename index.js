const express = require('express');
const cors = require('cors');
const multer = require('multer');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

//middlewares
app.use(cors());
app.use(express.json());

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const uri = `mongodb+srv://${process.env.USER}:${process.env.PASSWORD}@cluster0.fhbw5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const userCollection = client.db("rentzDB").collection("users");
    const carCollection = client.db("rentzDB").collection("cars");

    app.get('/', (req, res) => {
      res.send('server is running')
    })

    //user realted api
    app.put('/users', async (req, res) => {
      const filter = { email: req.body.email };
      const updatedDoc = {
        $set: req.body
      }
      const options = { upsert: true };
      const result = await userCollection.updateOne(filter, updatedDoc, options);
      res.send(result);
    })


    //car related api
    app.post('/cars', upload.single('image'), async (req, res) => {
      const { buffer, originalname, mimetype } = req.file;
      const doc = {
        ...req.body,
        filename: originalname,
        contentType: mimetype,
        data: buffer,
      };
      const result = await carCollection.insertOne(doc);
      res.send(result);
    })

    app.listen(port, () => {
      console.log('running on port: ', port);
    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


