import requests
import datetime
import urllib.request
import urllib.error
import os
import io
import csv
import pandas as pd

class Job(object):
    class Costant(object):
        """ An innner class that stores all the constants. """
        def __init__(self):
            self.DAY_ZERO = datetime.datetime(2020, 1, 22) # 2020-1-23 will be day one.
            self.STATES = self.load_states()
            self.STATE_MAPPING = self.load_state_mapping()


        def load_states(self):
            """ Return a list of states. """
            states = []
            with open("./us_states_list.txt") as f:
                for line in f:
                    states.append(line.strip())

            return states


        def load_state_mapping(self):
            """ Return a mapping of <state id, state name>. """

            MAPPING_CSV_URL = "https://raw.githubusercontent.com/reichlab/covid19-forecast-hub/master/data-locations/locations.csv"
            f = io.StringIO(urllib.request.urlopen(MAPPING_CSV_URL).read().decode('utf-8'))
            reader = csv.reader(f)
            state_mapping = {}

            # Skip first two lines
            next(reader)
            next(reader)

            for row in reader:
                state_id = int(row[1])
                state_name = row[2]
                state_mapping[state_id] = state_name

            return state_mapping


    """ Job class """
    def __init__(self):
        self.costant = self.Costant()
        self.input_directory = ""       # The directory of input reports.
        self.output_directory = ""      # The directory of output reports.
        self.source = ""


    def set_input_directory(self, input_directory):
        self.input_directory = input_directory


    def set_output_directory(self, output_directory):
        self.output_directory = output_directory


    def set_source(self, source):
        self.source = source


    def fetch_truth_cumulative_cases(self):
        dataset = {}
        URL = "https://raw.githubusercontent.com/reichlab/covid19-forecast-hub/master/data-truth/truth-Cumulative%20Cases.csv"

        f = io.StringIO(urllib.request.urlopen(URL).read().decode('utf-8'))
        reader = csv.reader(f)
        header = next(reader, None)

        location_col = -1
        date_col = -1
        value_col = -1

        for i in range(0, len(header)):
            if (header[i] == "location"):
                location_col = i
            elif (header[i] == "date"):
                date_col = i
            elif (header[i] == "value"):
                value_col = i

        for row in reader:
            # Skip US' country level report.
            if row[location_col] == "US" or row[location_col] == "NA":
                continue

            state_id = int(row[location_col])

            if state_id not in self.costant.STATE_MAPPING:
                continue

            state = self.costant.STATE_MAPPING[state_id]
            date = row[date_col]
            val = int(row[value_col])
            if state not in dataset:
                dataset[state] = {}

            dataset[state][date] = val
        return dataset

    def fetch_forecast_inc_cases(self, file_dir):
        dataset = {}
        with open(file_dir) as f:
            reader = csv.reader(f)
            header = next(reader, None)

            # Because different csv files have different column arrangements,
            # find out the index the columns containing different data fields first.
            location_col = -1
            date_col = -1
            target_col = -1
            type_col = -1
            value_col = -1

            for i in range(0, len(header)):
                if (header[i] == "location"):
                    location_col = i
                elif (header[i] == "target_end_date"):
                    date_col = i
                elif (header[i] == "target"):
                    target_col = i
                elif (header[i] == "type"):
                    type_col = i
                elif (header[i] == "value"):
                    value_col = i

            for row in reader:
                if (row[type_col] == "point" \
                    and "inc case" in row[target_col] \
                    and row[location_col] != "US"):
                    state_id = int(row[location_col])
                    state = self.costant.STATE_MAPPING[state_id]
                    date = row[date_col]
                    val = int(float(row[value_col]))
                    if state not in dataset:
                        dataset[state] = {}

                    # Skip duplicate predictions on the same date.
                    if date in dataset[state]:
                        continue

                    dataset[state][date] = val
        return dataset


    def write_report(self, model_name, forecast_date, observed, predicted, output_model_dir):
        columns = ['State']
        columns.append((forecast_date - self.costant.DAY_ZERO).days)

        for date_str in predicted[self.costant.STATES[0]]:
            date = datetime.datetime.strptime(date_str,"%Y-%m-%d")
            # Skip if the target end day is not Saturday.
            if (date.weekday() != 5):
                continue
            columns.append((datetime.datetime.strptime(date_str,"%Y-%m-%d") - self.costant.DAY_ZERO).days)
        dataframe = pd.DataFrame(columns=columns)

        for state in self.costant.STATES:
            new_row = {}
            new_row["State"] = state
            if state in observed and forecast_date.strftime("%Y-%m-%d") in observed[state]:
                new_row[(forecast_date - self.costant.DAY_ZERO).days] = observed[state][forecast_date.strftime("%Y-%m-%d")]
            else:
                new_row[(forecast_date - self.costant.DAY_ZERO).days] = "NaN"

            for date_str in predicted[self.costant.STATES[0]]:
                date = datetime.datetime.strptime(date_str,"%Y-%m-%d")
                # Skip if the target end day is not Saturday.
                if (date.weekday() != 5):
                    continue
                if state in predicted and date_str in predicted[state]:
                    new_row[(date - self.costant.DAY_ZERO).days] = predicted[state][date_str]
                else:
                    new_row[(date - self.costant.DAY_ZERO).days] = "NaN"

            dataframe = dataframe.append(new_row, ignore_index=True)

        output_name = model_name + '_' + str((forecast_date - self.costant.DAY_ZERO).days) + ".csv"
        output_name = output_name.replace('-', '_')
        dataframe.to_csv(output_model_dir + output_name)
        print(output_name + " has been written.")


    def run(self):
        """
        After data source, input, output directory have been set.
        Read "{source}.txt" to fetch the forecast reports' filenames.
        Generate the truth data set and forecast data set,
        and write down formatted forecast reports into csv.
        """
        forecasts = []
        with open(self.source + ".txt") as f:
            for line in f:
                forecasts.append(line.strip())

        observed = self.fetch_truth_cumulative_cases()
        for forecast_filename in forecasts:
            try:
                forecast_date = datetime.datetime.strptime(forecast_filename[:10],"%Y-%m-%d")
                model_name = forecast_filename[11:-4]
                predicted = self.fetch_forecast_inc_cases(self.input_directory + forecast_filename)
                # Create the model_name output directory if it does exists.
                output_model_dir = (self.output_directory + model_name + '/').replace("-", "_")
                if not os.path.exists(output_model_dir):
                    os.mkdir(output_model_dir)
                self.write_report(model_name, forecast_date, observed, predicted, output_model_dir)
            except:
                print("fail to read file " + forecast_filename + ".")


if __name__ == "__main__":
    job = Job()
    job.set_input_directory("./input/")
    job.set_output_directory("./output/")
    job.set_source("state_case")
    job.run()
