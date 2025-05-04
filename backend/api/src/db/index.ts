import mongoose from "mongoose";

let candleDbConnection: mongoose.Connection;

export const connectDB = () => {
  mongoose.connect(process.env.MONGODB_URI!).then(() => {
    console.log("Connected to MongoDB");
  }).catch((err) => {
    console.log("Error connecting to MongoDB", err);
  });
};

export const connectCandleDB = () => {
  // Use createConnection instead of connect for second database
  candleDbConnection = mongoose.createConnection(process.env.CANDLE_DB_URI!);
  
  candleDbConnection.on('connected', () => {
    console.log("Connected to Candle MongoDB");
  });
  
  candleDbConnection.on('error', (err) => {
    console.log("Error connecting to Candle MongoDB", err);
  });
};

// Export the candle connection so it can be used elsewhere
export const getCandleDbConnection = () => candleDbConnection;
