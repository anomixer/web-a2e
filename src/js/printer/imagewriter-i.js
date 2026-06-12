/*
 * imagewriter-i.js - Apple ImageWriter I printer emulation
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import { ImageWriterII } from "./imagewriter-ii.js";

// ImageWriter I uses the same ESC protocol as the II with a subset of features.
export class ImageWriterI extends ImageWriterII {
  getName() { return "ImageWriter I"; }
  getId()   { return "imagewriter-i"; }
}
