<?
echo $ajax->div('CityNameDiv');
echo $filterCityName;
echo $ajax->divEnd('CityNameDiv');

echo $ajax->div('ThingsCountDiv'); 
echo "$totalFilteredCount &nbsp; Global - $globalCount"; 
echo $ajax->divEnd('ThingsCountDiv');

echo $ajax->div('ThingsDiv');
include 'things.inc'; 
echo $ajax->divEnd('ThingsDiv'); 
?>