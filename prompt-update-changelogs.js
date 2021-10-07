const Confirm = require('prompt-confirm');
const prompt = new Confirm(
  "Update and save CHANGELOGs (but don't commit them). When finished, type 'Y'"
);

return prompt.ask((answer) => {
  if (!answer) {
    process.exit(1);
  }
});
