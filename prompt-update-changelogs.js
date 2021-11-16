const Confirm = require("prompt-confirm");

return (new Confirm(
  "Update and save CHANGELOGs (but don't commit them). When finished, type 'Y'."
).ask((answer) => {
  if (!answer) {
    process.exit(1);
  } else {
    new Confirm(
      "Make sure you've `git add`ed your changes (but don't commit them). When finished, type 'Y'."
    ).ask((answer) => {
      if (!answer) {
        process.exit(1);
      }
    });
  }
}));
