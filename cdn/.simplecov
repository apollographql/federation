require 'codecov'
SimpleCov.formatter = SimpleCov::Formatter::Codecov

SimpleCov.start do
  add_filter "/test/"
  add_filter "/node_modules/"
  track_files "public/cli/install.sh"
end