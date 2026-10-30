    paintSimilarConnectedPixelsFromFrame: function (
      frame,
      col,
      row,
      replacementColor
    ) {
      /**
       *  Queue linear Flood-fill (node, target-color, replacement-color):
       *   1. Set Q to the empty queue.
       *   2. If the color of node is not equal to target-color, return.
       *   3. Add node to Q.
       *   4. For each element n of Q:
       *   5.     If the color of n is equal to target-color:
       *   6.         Set w and e equal to n.
       *   7.         Move w to the west until the color of the node to the west of w no longer matches target-color.
       *   8.         Move e to the east until the color of the node to the east of e no longer matches target-color.
       *   9.         Set the color of nodes between w and e to replacement-color.
       *  10.         For each node n between w and e:
       *  11.             If the color of the node to the north of n is target-color, add that node to Q.
       *  12.             If the color of the node to the south of n is target-color, add that node to Q.
       *  13. Continue looping until Q is exhausted.
       *  14. Return.
       */
      if (typeof replacementColor == "string") {
        replacementColor = pskl.utils.colorToInt(replacementColor);
      }

      var targetColor;
      try {
        targetColor = frame.getPixel(col, row);
      } catch {
        // Frame out of bound exception.
      }

      if (targetColor === null || targetColor == replacementColor) {
        return;
      }

      var startPixel = {
        col: col,
        row: row
      };
      var paintedPixels = pskl.PixelUtils.visitConnectedPixels(
        startPixel,
        frame,
        function (pixel) {
          if (frame.getPixel(pixel.col, pixel.row) == targetColor) {
            frame.setPixel(pixel.col, pixel.row, replacementColor);
            return true;
          }
          return false;
        }
      );
      return paintedPixels;
    },

    /**
     * Starting from a provided origin, visit connected pixels using a visitor function.
     * After visiting a pixel, select the 4 connected pixels (up, right, down, left).
     * Call the provided visitor on each pixel. The visitor should return true if the
     * pixel should be considered as connected. If the pixel is connected repeat the
     * process with its own connected pixels
     *
     * TODO : Julian : The visitor is also responsible for making sure a pixel is never
     * visited twice. This could be handled by default by this method.
     *
     * @return {Array} the array of visited pixels {col, row}
     */
    visitConnectedPixels: function (pixel, frame, pixelVisitor) {
      var queue = [];
      var visitedPixels = [];
      var dy = [-1, 0, 1, 0];
      var dx = [0, 1, 0, -1];

      queue.push(pixel);
      visitedPixels.push(pixel);
      pixelVisitor(pixel);

      var loopCount = 0;
      var cellCount = frame.getWidth() * frame.getHeight();
      while (queue.length > 0) {
        loopCount++;

        var currentItem = queue.pop();

        for (var i = 0; i < 4; i++) {
          var nextCol = currentItem.col + dx[i];
          var nextRow = currentItem.row + dy[i];
          try {
            var connectedPixel = { col: nextCol, row: nextRow };
            var isValid = pixelVisitor(connectedPixel);
            if (isValid) {
              queue.push(connectedPixel);
              visitedPixels.push(connectedPixel);
            }
          } catch {
            // Frame out of bound exception.
          }
        }

        // Security loop breaker:
        if (loopCount > 10 * cellCount) {
          console.log("loop breaker called");
          break;
        }
      }

      return visitedPixels;
    },

