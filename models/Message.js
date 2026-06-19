const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    senderName: { type: String, required: true },
    senderRole: { type: String, enum: ["admin", "user"], required: true },
    content: { type: String, default: "" },
    type: { type: String, enum: ["text", "image"], default: "text" },
    imageUrl: { type: String, default: null },
    isRead: { type: Boolean, default: false },
    hiddenFromUser: { type: Boolean, default: false },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Message", messageSchema);
