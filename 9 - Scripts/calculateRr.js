function calculateRr(tp) {
  // Get values from the note's properties (frontmatter)
  const handles = parseFloat(tp.frontmatter.handles);
  const stop_loss = parseFloat(tp.frontmatter.stop_loss);

  // Check if the values are valid numbers and stop_loss is not zero
  if (!isNaN(handles) && !isNaN(stop_loss) && stop_loss !== 0) {
    // Calculate the ratio, round it to 2 decimal places...
    const ratio = (handles / Math.abs(stop_loss)).toFixed(2);
    // ...and return it as a proper number
    return Number(ratio); 
  }
  
  // If data is missing or invalid, return null (which leaves the property empty)
  return null; 
}

module.exports = calculateRr;