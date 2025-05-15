import mongoose, { Schema, Document } from 'mongoose';

export interface IInviteCode extends Document {
  name: string;
  limit: number;
  addresses: string[];
  owner: string; // Could be a Twitter ID or another identifier for who created/owns the code
  createdAt: Date;
}

const InviteCodeSchema = new Schema<IInviteCode>({
  name: { 
    type: String, 
    required: true, 
    unique: true,
    index: true 
  },
  limit: { 
    type: Number, 
    required: true,
    default: 1 // Default limit if not specified
  },
  addresses: {
    type: [String],
    default: []
  },
  owner: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.models.InviteCode || mongoose.model<IInviteCode>('InviteCode', InviteCodeSchema); 