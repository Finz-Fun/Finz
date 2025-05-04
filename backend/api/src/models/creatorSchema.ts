import mongoose, { Schema, Document } from 'mongoose';

export interface ICreator extends Document {
  twitterId: string;
  name: string;
  username: string;
  email?: string;
  profileImage: string;
  createdAt: Date;
  lastLogin: Date;
  followers: number;
  following: number;
  tokens: string[];
  walletAddress?: string;
  agentEnabled: boolean;
}

const CreatorSchema = new Schema({
  twitterId: { 
    type: String, 
    required: true, 
    unique: true 
  },
  name: { 
    type: String, 
    required: true 
  },
  username: { 
    type: String, 
    required: true 
  },
  // email: { 
  //   type: String 
  // },
  profileImage: { 
    type: String 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  lastLogin: { 
    type: Date 
  },
  // followers: { 
  //   type: Number, 
  //   default: 0 
  // },
  // following: { 
  //   type: Number, 
  //   default: 0 
  // },
  walletAddress: { 
    type: String 
  },
  agentEnabled: {
    type: Boolean,
    default: false
  }
});

// Prevent duplicate model initialization
export default mongoose.model('Creator', CreatorSchema);