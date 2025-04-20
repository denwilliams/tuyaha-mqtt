export class DataUtil {
  constructor() {}

  getSubService(status: { value: unknown; code: string }[]) {
    var subTypeArr: string[] = [];
    for (var map of status) {
      if (map.code.indexOf("switch") != -1) {
        if (typeof map.value === "boolean") {
          subTypeArr.push(map.code);
        }
      }
    }
    return {
      subType: subTypeArr,
    };
  }
}
