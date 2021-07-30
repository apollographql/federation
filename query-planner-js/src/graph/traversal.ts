export function depthFirstSearch(props: {
    root: any,
    visit: (node: any) => void,
    getChildren: (node: any) => any[]})
{
    const {root, visit, getChildren} = props;

    let stack: any[] = [];
    let discovered = new Set();
    stack.push(root);

    discovered.add(root);

    while (stack?.length) {
        let currNode = stack.pop();
        visit(currNode)

        getChildren(currNode)
            .filter((n: any) => {
                return !discovered.has(n)
            })
            .forEach((n: any) => {
                discovered.add(n);
                stack.push(n);
            });
    }
}