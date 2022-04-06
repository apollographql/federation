<img src="https://raw.githubusercontent.com/apollographql/space-kit/main/src/illustrations/svgs/astronaut1.svg" width="100%" height="144">

# Apollo Contributor Guide

> If this is your first time or 100th time contributing to a project, the [Open Source Guide](https://opensource.guide/how-to-contribute/) is a fantastic place to learn about Open Source Software (OSS) and how to get involved.

Excited about Apollo and want to make it better? We’re excited too!

Apollo is a community of developers just like you, striving to create the best tools and libraries around GraphQL. We welcome anyone who wants to contribute or provide constructive feedback, no matter the age or level of experience. If you want to help but don't know where to start, let us know, and we'll find something for you.

Oh, and if you haven't already, join the [Apollo community](https://community.apollographql.com/).

Here are some ways to contribute to the project, from easiest to most difficult:

- [Reporting bugs](#reporting-bugs)
- [Improving the documentation](#improving-the-documentation)
- [Responding to issues](#responding-to-issues)
- [Small bug fixes](#small-bug-fixes)
- [Suggesting features](#suggesting-features)
- [Big changes or new features](#big-changes-or-new-features)

## Issues

### Reporting bugs

If you encounter a bug, please file an issue on this GitHub repository. If an issue you have is already reported, please add additional information or add a 👍 reaction to indicate your agreement.

While we will try to be as helpful as we can on any issue reported, please include the following to maximize the chances of a quick fix:

1. **Intended outcome:** What you were trying to accomplish when the bug occurred, and as much code as possible related to the source of the problem.
2. **Actual outcome:** A description of what actually happened, including a screenshot or copy-paste of any related error messages, logs, or other output that might be related. Please avoid non-specific phrases like “didn’t work” or “broke”.
3. **How to reproduce the issue:** Instructions for how the issue can be reproduced by a maintainer or contributor. Be as specific as possible, and only mention what is necessary to reproduce the bug.

Creating a good reproduction really helps contributors investigate and resolve your issue quickly. In many cases, the act of creating a minimal reproduction illuminates that the source of the bug was somewhere outside the library in question, saving time and effort for everyone.

### Current branches

1. **Federation 2 (alpha)** is the current `main` branch.
2. **Prior releases** are located under the `version-0.x` branch.  This comprises all 0.x packages previously released.  Installing `latest` from npm will pull from here.

### Improving the documentation

Improving the documentation, examples, and other open source content can be the easiest, and one of the most important, way to contribute to the library. If you see a piece of content that can be better, open a PR with an improvement, no matter how small! If you would like to suggest a big change or major rewrite, we’d love to hear your ideas! Please open a feature request for discussion before writing the PR.

### Responding to issues

In addition to reporting issues, a great way to contribute to Apollo is to respond to other peoples' issues and try to identify the problem or help them work around it. If you’re interested in taking a more active role in this process, please go ahead and respond to issues. And don't forget to say "Hi" in the [Apollo community](https://community.apollographql.com/)!

### Small bug fixes

For a small bug fix change (less than ~20 lines of code changed), feel free to open a pull request. We’ll try to merge it as fast as possible. The only requirement is, make sure you also add a test that verifies the bug you are trying to fix, and that the coverage report covers as much of your code as possible.

### Suggesting features

Most of the features in Apollo Client came from suggestions by you, the community! We welcome any ideas about how to make Apollo better for your use case. Open up a new feature request / discussion issue with your details.

## Big Changes or New Features

For significant changes to a repository, it’s important to settle on a design before starting on the implementation. This way, we can make sure that major improvements get the care and attention they deserve. Since big changes can be risky and might not always get merged, it’s good to reduce the amount of possible wasted effort by agreeing on an implementation design/plan first.

1. **Open an issue.** Open an issue about your bug or feature request in this repo.  Check to make sure you're targeting the federation version you want.
2. **Reach consensus.** Some contributors and community members should reach an agreement that this feature or bug is important, and that someone should work on implementing or fixing it.
3. **Agree on intended behavior.** On the issue, reach an agreement about the desired behavior. In the case of a bug fix, it should be clear what it means for the bug to be fixed, and in the case of a feature, it should be clear what it will be like for developers to use the new feature.
4. **Agree on implementation plan.** Write a plan for how this feature or bug fix should be implemented. What modules need to be added or rewritten? Should this be one pull request or multiple incremental improvements? Who is going to do each part?
5. **Submit PR.** In the case where multiple dependent patches need to be made to implement the change, only submit one at a time. Otherwise, the others might get stale while the first is reviewed and merged. Make sure to avoid “while we’re here” type changes - if something isn’t relevant to the improvement at hand, it should be in a separate PR; this especially includes code style changes of unrelated code.
6. **Review.** At least one core contributor should sign off on the change before it’s merged. Look at the “code review” section below to learn about factors are important in the code review. If you want to expedite the code being merged, try to review your own code first!
7. **Merge and release!**

### Code review guidelines

It’s important that every piece of code in Apollo packages is reviewed by at least one core contributor familiar with that codebase. Here are some things we look for:

1. **Required CI checks pass.** This is a prerequisite for the review, and it is the PR author's responsibility. As long as the tests don’t pass, the PR won't get reviewed. To learn more about our CI pipeline, read about it [below](#pipelines)
2. **Simplicity.** Is this the simplest way to achieve the intended goal? If there are too many files, redundant functions, or complex lines of code, suggest a simpler way to do the same thing. In particular, avoid implementing an overly general solution when a simple, small, and pragmatic fix will do.
3. **Testing.** Do the tests ensure this code won’t break when other stuff changes around it? When it does break, will the tests added help us identify which part of the library has the problem? Did we cover an appropriate set of edge cases? Look at the test coverage report if there is one. Are all significant code paths in the new code exercised at least once?
4. **No unnecessary or unrelated changes.** PRs shouldn’t come with random formatting changes, especially in unrelated parts of the code. If there is some refactoring that needs to be done, it should be in a separate PR from a bug fix or feature, if possible.
5. **Code has appropriate comments.** Code should be commented describing the problem it is solving, not just the technical implementation.

## Pipelines

This project uses GitHub Actions to run a continuous integration and delivery pipeline. Every code change will be run against a few steps to help keep the project running at its peak ability.

- **CLA Check**: If you haven’t signed the Apollo CLA, a bot will comment on your PR asking you to do this
- **Tests**: The CI will run the `cargo test` command.
- **Coverage**: This project runs a job to collect information on how much of the library has been tested using code coverage tools. This is a WIP but you may see a status check related to how you have improved (or lowered 😢) the amount covered. Don’t worry, it happens to all of us and we are here to help out!

After you have opened your PR and all of the status checks are passing, please assign it to one of the maintainers (found in the bottom of [the README](./README.md#contributing) who will review it and give feedback.

<img src="https://raw.githubusercontent.com/apollographql/space-kit/main/src/illustrations/svgs/observatory.svg" width="100%" height="144">
