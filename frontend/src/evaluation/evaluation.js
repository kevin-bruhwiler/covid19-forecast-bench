import React, { Component } from "react";
import Papa from "papaparse";
import { readRemoteFile } from "react-papaparse";
import Evalgraph from "./evalgraph";
import Evalmap from "./evalmap";
import RankingTable from "./rankingTable";
import "./evaluation.css";
import { Form, Select, Row, Col, Radio, List, Avatar } from "antd";
import FormItem from "antd/lib/form/FormItem";
import ReactGA from "react-ga";

const { Option } = Select;

const US_STATES = [
  "Washington",
  "Illinois",
  "California",
  "Arizona",
  "Massachusetts",
  "Wisconsin",
  "Texas",
  "Nebraska",
  "Utah",
  "Oregon",
  "Florida",
  "New York",
  "Rhode Island",
  "Georgia",
  "New Hampshire",
  "North Carolina",
  "New Jersey",
  "Colorado",
  "Maryland",
  "Nevada",
  "Tennessee",
  "Hawai",
  "Indiana",
  "Kentucky",
  "Minnesota",
  "Oklahoma",
  "Pennsylvania",
  "South Carolina",
  "District of Columbia",
  "Kansas",
  "Missouri",
  "Vermont",
  "Virginia",
  "Connecticut",
  "Iowa",
  "Louisiana",
  "Ohio",
  "Michigan",
  "South Dakota",
  "Arkansas",
  "Delaware",
  "Mississippi",
  "New Mexico",
  "North Dakota",
  "Wyoming",
  "Alaska",
  "Maine",
  "Alabama",
  "Idaho",
  "Montana",
  "Puerto Rico",
  "Virgin Islands",
  "Guam",
  "West Virginia",
  "Northern Mariana Islands",
  "American Samoa",
];

// TODO: Since we only have limited number of ML/AI methods, they are hardcoded here.
// Later we got to fetch this file from a file/online source.
const ML_MODELS = [
  "UMich_RidgeTfReg",
  "SIkJaun10_hyper7",
  "ensemble_SIkJa_RF",
  "SIkJaun1_window_noval",
  "SIkJaun1_hyper7_smooth7",
  "SIkJaun1_hyper7",
  "SIkJaun10_window_noval",
  "SIkJaun10_hyper7_smooth7",
];

class Evaluation extends Component {
  constructor(props) {
    super(props);
    this.state = {
      region: "states",
      filter: "all",
      humanMethods: [],
      mlMethods: [],
      methodList: [],
      allMethods: [],
      csvData: [],
      mainGraphData: {},
      rankingTableData: [],
      metrics: "MAE",
      metricsList: ["MAE", "MAPE (coming soon)", "RMSE (coming soon)"],
      forecastType: "incDeath",
      timeSpan: "4",
      lastDate: "",
    };
  }

  componentDidMount() {
    ReactGA.initialize("UA-186385643-2");
    ReactGA.pageview("/covid19-forecast-bench/evaluation");
  }

  componentWillMount = () => {
    this.formRef = React.createRef();
    Papa.parse(
      `https://raw.githubusercontent.com/scc-usc/covid19-forecast-bench/master/evaluation/state_death_eval/summary_${this.state.timeSpan}_weeks_ahead_${this.state.region}.csv`,
      {
        download: true,
        worker: true,
        header: true,
        skipEmptyLines: true,
        complete: this.initialize,
      }
    );
  };

  initialize = result => {
    result.data.map((csvRow, index) => {
      for (const col in csvRow) {
        if (col === "" && csvRow[col] !== " ") {
          this.setState(state => {
            const methodList = state.methodList.concat(csvRow[col]);
            return {
              methodList,
            };
          });
        }
      }
    });

    this.updateData(result, () => {
      this.generateRanking();

      this.addMethod("ensemble_SIkJa_RF");
      this.addMethod("reich_COVIDhub_ensemble");
    });
  };

  updateData = (result, func) => {
    let anchorDatapoints = { maeData: [] };

    const csvData = result.data
      .map((csvRow, index) => {
        const method = { id: "", data: [] };
        for (const col in csvRow) {
          if (col === "") {
            method.id = csvRow[col];
          } else {
            const val = parseInt(csvRow[col]);
            // Filter out datapoints that is NaN.
            method.data.push({
              x: col,
              y: val,
            });
          }
        }
        // If method id is an empty space, the data are empty anchor datapoints.
        if (method.id == " ") {
          anchorDatapoints.dataSeries = method.data;
        }
        return method;
      })
      .filter(method => method.id !== " " && method.data.length !== 0); // Filter out anchor datapoints and methods which do not have any forecasts.

    this.setState(
      {
        csvData: csvData,
        mainGraphData: { anchorDatapoints },
      },
      () => {
        this.reloadAll();
        if (typeof func === "function" && func()) {
          func();
        }
      }
    );
  };

  generateRanking = () => {
    // First filter out the covid hub baseline MAE average.
    let baselineAverageMAE = this.state.csvData.filter(method => method.id === "reich_COVIDhub_baseline")[0];

    const rankingTableData = this.state.csvData.map(method => {
      const methodName = method.id;
      const methodType = this.isMLMethod(methodName) ? "ML/AI" : "Human-Expert";
      let forecastCount = 0;
      let MAE_Sum = 0;
      let relativeMAE_Sum = 0;  // Sum of method_MAE/baseline_MAE
      method.data.forEach((dp, idx) =>
      {
        if (!isNaN(dp.y)) {
          MAE_Sum += dp.y;
          relativeMAE_Sum += dp.y / baselineAverageMAE.data[idx].y;
          forecastCount++;
        }
      });
      if (forecastCount === 0) {
        return null;
      }
      const averageMAE = (MAE_Sum / forecastCount).toFixed(2);
      const relativeMAE = (relativeMAE_Sum / forecastCount).toFixed(3);
      return { methodName, methodType, averageMAE, relativeMAE, forecastCount };
    }).filter(entry => entry);  // Filter out methods without any forecasts.

    this.setState({
      rankingTableData: rankingTableData,
    });
  };

  methodIsSelected = method => {
    if (this.state.allMethods && method) {
      return this.state.allMethods.includes(method);
    }
    return false;
  };

  doesMethodFitFilter = (method, filter) => {
    if (filter === "ml") {
      return ML_MODELS.includes(method);
    } else if (filter === "human") {
      return !ML_MODELS.includes(method);
    }
    return true;
  };

  isMLMethod = method => {
    return this.doesMethodFitFilter(method, "ml");
  };

  addMethod = method => {
    if (this.methodIsSelected(method)) {
      return;
    }
    const methodDataSeries = this.state.csvData.filter(
      data => data.id === method
    )[0].data;
    const methodGraphData = { dataSeries: methodDataSeries };

    this.setState(
      prevState => {
        return {
          humanMethods: this.isMLMethod(method)
            ? prevState.humanMethods
            : [...prevState.humanMethods, method],
          mlMethods: !this.isMLMethod(method)
            ? prevState.mlMethods
            : [...prevState.mlMethods, method],
          allMethods: [...prevState.allMethods, method],
          mainGraphData: {
            ...prevState.mainGraphData,
            [method]: methodGraphData,
          },
        };
      },
      () => {
        this.formRef.current.setFieldsValue({
          methods: this.state.allMethods,
        });
      }
    );
  };

  removeMethod = targetMethod => {
    if (targetMethod === " ") {
      return;
    }
    let humanMethods = this.state.humanMethods;
    let mlMethods = this.state.mlMethods;
    let allMethods = this.state.allMethods;

    if (!this.isMLMethod(targetMethod)) {
      humanMethods = humanMethods.filter(method => method !== targetMethod);
    } else {
      mlMethods = mlMethods.filter(method => method !== targetMethod);
    }
    allMethods = allMethods.filter(method => method != targetMethod);

    this.setState(prevState => {
      return {
        humanMethods: humanMethods,
        mlMethods: mlMethods,
        allMethods: allMethods,
        mainGraphData: Object.keys(prevState.mainGraphData)
          .filter(method => method !== targetMethod)
          .reduce((newMainGraphData, method) => {
            return {
              ...newMainGraphData,
              [method]: prevState.mainGraphData[method],
            };
          }, {}),
      };
    });
  };

  onValuesChange = (changedValues, allValues) => {
    const prevMethods = this.state.allMethods;
    const newMethods = allValues.methods;
    if (newMethods && prevMethods) {
      const methodsToAdd = newMethods.filter(
        method => !prevMethods.includes(method)
      );
      const methodsToRemove = prevMethods.filter(
        method => !newMethods.includes(method)
      );

      methodsToAdd.forEach(this.addMethod);
      methodsToRemove.forEach(this.removeMethod);
    }
  };

  reloadAll = () => {
    const prevMethods = this.state.allMethods;
    this.setState(
      {
        humanMethods: [],
        mlMethods: [],
        allMethods: [],
      },
      () => {
        prevMethods.forEach(this.addMethod);
      }
    );
  };

  handleErrorTypeSelect = e => {
    this.setState({
      errorType: e.target.value,
    });
  };

  handleTimeSpanSelect = e => {
    this.setState({
      timeSpan: e.target.value,
    });
    Papa.parse(
      `https://raw.githubusercontent.com/scc-usc/covid19-forecast-bench/master/evaluation/state_death_eval/summary_${e.target.value}_weeks_ahead_${this.state.region}.csv`,
      {
        download: true,
        worker: true,
        header: true,
        skipEmptyLines: true,
        complete: this.updateData,
      }
    );
  };

  handleRegionChange = newRegion => {
    this.setState(
      {
        region: newRegion,
      },
      () => {
        Papa.parse(
          `https://raw.githubusercontent.com/scc-usc/covid19-forecast-bench/master/evaluation/state_death_eval/summary_${this.state.timeSpan}_weeks_ahead_${this.state.region}.csv`,
          {
            download: true,
            header: true,
            worker: true,
            skipEmptyLines: true,
            complete: this.updateData,
          }
        );

        this.formRef.current.setFieldsValue({
          region: this.state.region,
        });
      }
    );
  };

  handleFilterChange = e => {
    this.setState({
      filter: e.target.value,
    });
  };

  render() {
    const {
      filter,
      humanMethods,
      mlMethods,
      allMethods,
      methodList,
      region,
      metrics,
      metricsList,
      timeSpan,
      mainGraphData,
      rankingTableData,
    } = this.state;

    const methodOptions = methodList
      .filter(method => !this.methodIsSelected(method))
      .filter(method => this.doesMethodFitFilter(method, filter))
      .sort()
      .map(s => {
        return <Option key={s}> {s} </Option>;
      });

    const formLayout = {
      labelCol: { span: 6 },
      wrapperCol: { span: 18 },
    };

    const regionOptions = [];
    regionOptions.push(
      <Option value="states" key="0">
        US Average
      </Option>
    );
    US_STATES.forEach((state, index) => {
      regionOptions.push(
        <Option value={state.replace(" ", "%20")} key={index + 1}>
          {state}
        </Option>
      );
    });

    return (
      <div className="leader-page-wrapper">
        <div className="evaluation-container">
          <div className="control-container">
            <Row type="flex" justify="space-around">
              <Col span={12}>
                <Form
                  {...formLayout}
                  ref={this.formRef}
                  onValuesChange={this.onValuesChange}
                >
                  
                  
                  {/* TODO: The metrics options have not been implemented. */}
                  <Form.Item label="Forecast Type" name="forecastType">
                    <Select showSearch defaultValue="incDeath">
                      <Option value="incDeath">
                        COVID-19 US state-level death forecasts
                      </Option>
                      <Option value="incCase">
                        COVID-19 US state-level case forecasts (coming soon)
                      </Option>
                    </Select>
                  </Form.Item>

                  <Form.Item label="Region" name="region">
                    <Select
                      showSearch
                      placeholder="Select a region"
                      defaultValue="states"
                      value={region}
                      onChange={this.handleRegionChange}
                    >
                      {regionOptions}
                    </Select>
                    </Form.Item>

                    <Form.Item label="Highlight" name="filter">
                    <Radio.Group
                      defaultValue="all"
                      onChange={this.handleFilterChange}
                    >
                      <Radio.Button value="all">All Methods</Radio.Button>
                      <Radio.Button value="ml">ML/AI Methods</Radio.Button>
                      <Radio.Button value="human">
                        Human-Expert Methods
                      </Radio.Button>
                    </Radio.Group>
                  </Form.Item>

                  
                  <Form.Item label="Methods" name="methods">
                    <Select mode="multiple" placeholder="Select Methods">
                      {methodOptions}
                    </Select>
                  </Form.Item>
                  {/* TODO: The metrics options have not been implemented. */}
                  <Form.Item label="Metrics" name="metrics">
                    <Select showSearch defaultValue="MAE">
                      {metricsList.map((m, idx) => (
                        <Option value={m} key={idx}>
                          {m}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                  
                  <Form.Item label="Prediction Time Span" name="timeSpan">
                    <Radio.Group
                      value={timeSpan}
                      defaultValue={"4"}
                      onChange={this.handleTimeSpanSelect}
                    >
                      <Radio value="1">1-week-ahead</Radio>
                      <Radio value="2">2-week-ahead</Radio>
                      <Radio value="3">3-week-ahead</Radio>
                      <Radio value="4">4-week-ahead</Radio>
                    </Radio.Group>
                  </Form.Item>
                </Form>
              </Col>
            </Row>
          </div>
          <Row type="flex" justify="space-around">
            <div className="evalmap-container">
              <Evalmap clickHandler={this.handleRegionChange} region={region} />
            </div>

            <div className="evalgraph-container">
              <Evalgraph
                className="graph"
                data={mainGraphData}
                mlMethods={mlMethods}
                humanMethods={humanMethods}
                allMethods={allMethods}
                filter={filter}
                metrics={metrics}
              />
            </div>
          </Row>
          <Row type="flex" justify="space-around">
            <div className="ranking-table-container">
              <RankingTable
                data={rankingTableData}
                addMethod={this.addMethod}
              />
            </div>
          </Row>
        </div>
      </div>
    );
  }
}

export default Evaluation;
