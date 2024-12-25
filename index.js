const express = require('express');
const cors = require('cors');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId, Int32 } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

//middlewares
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());
const tokenVerifier = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: 'Authentication failed' });
  }
  jwt.verify(token, process.env.SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'Authentication failed' });
    }
    if (req.query.email !== decoded.email) {
      res.status(403).send({ message: 'Access denied' });
    }
    next();
  })
}


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

    const userCollection = client.db("rentrDB").collection("users");
    const carCollection = client.db("rentrDB").collection("cars");
    const bookingCollection = client.db("rentrDB").collection("bookings");

    app.get('/', (req, res) => {
      res.send('server is running')
    })

    //auth related api
    app.post('/auth', (req, res) => {
      const data = req.body;
      const token = jwt.sign(data, process.env.SECRET, { expiresIn: '12h' });
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
      }).send({ success: true });
    })

    app.post('/logOut', (req, res) => {
      res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
      }).send({ success: true });
    })

    //user related api
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
      const { bookingCount, ...data } = req.body;
      const doc = {
        bookingCount: new Int32(bookingCount),
        ...data,
        filename: originalname,
        contentType: mimetype,
        data: buffer,
      };
      const result = await carCollection.insertOne(doc);
      res.send(result);
    })

    app.get('/cars', async(req, res) => {
      const result = await carCollection.find().toArray();
      const cars = [];
      result.map(item => {
        const { data, contentType, ...car } = item;
        car.carImage = `data:${contentType};base64,${data.buffer.toString("base64")}`;
        cars.push(car);
      })
      res.send(cars);
    })

    app.get('/car/:id', async(req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id)};
      const result = await carCollection.findOne(query);
      const { data, contentType, ...car } = result;
      car.carImage = `data:${contentType};base64,${data.buffer.toString("base64")}`;
      res.send(car);
    })

    app.get('/userCars', tokenVerifier, async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await carCollection.find(query).toArray();
      const cars = [];
      result.map(item => {
        const { data, contentType, ...car } = item;
        car.carImage = `data:${contentType};base64,${data.buffer.toString("base64")}`;
        cars.push(car);
      })
      res.send(cars);
    });

    app.delete('/cars', async (req, res) => {
      const query = { _id: new ObjectId(req.query.id) };
      const result = await carCollection.deleteOne(query);
      res.send(result);
    })

    app.patch('/cars', upload.single('image'), async (req, res) => {
      let updatedDoc;
      const { _id, bookingCount, ...data } = req.body;
      if (req.file) {
        const { buffer, originalname, mimetype } = req.file;
        updatedDoc = {
          $set: {
            bookingCount: new Int32(bookingCount),
            ...data,
            filename: originalname,
            contentType: mimetype,
            data: buffer
          }
        }
      } else {
        updatedDoc = {
          $set: data
        }
      }
      const query = { _id: new ObjectId(_id) };
      const result = await carCollection.updateOne(query, updatedDoc);
      res.send(result);
    })

    //booking related api
    app.put('/bookings', async(req, res) => {
      const filter = { findingKey: req.body.findingKey };
      const updatedDoc = {
        $set: req.body
      }
      const options = { upsert: true };
      const result = await bookingCollection.updateOne(filter, updatedDoc, options);
      //updating booking count on both cars and bookings collection
      if(result.upsertedCount){
        const query = { _id: new ObjectId(req.body.carId)};
        const queryForBooking = { _id: new ObjectId(result.upsertedId)};
        const res = await carCollection.updateOne(query, { $inc: { bookingCount: 1} });
        const resForBooking = await bookingCollection.updateMany(queryForBooking, { $inc: { bookingCount: 1} });
      }
      res.send(result);
    })

    app.get('/userBookings', tokenVerifier, async(req, res) => {
      const user = req.query.email;
      const query = { bookedBy: user };
      const result = await bookingCollection.find(query).toArray();
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


