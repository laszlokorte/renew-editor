

export const numberSvgFormat = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 5,
    maximumFractionDigits: 5,
    useGrouping: false,
});


export function formattedNumbers(parts, ...args) {
    let accum = "";

    for (let p=0;p<args.length;p++) {
        const formatted = typeof args[p] === 'Number' ? numberSvgFormat.format(args[p]) : args[p];
        
        accum += parts[p] + formatted
    }

    accum += parts[parts.length-1]

    return accum

    // return (
    //     R.join(
    //         "",
    //         R.zipWith(
    //             R.concat,
    //             parts,
    //             R.map(
    //                 R.ifElse(
    //                     R.is(Number),
    //                     numberSvgFormat.format,
    //                     R.identity,
    //                 ),
    //                 args,
    //             ),
    //         ),
    //     ) + R.last(parts)
    // );
}