<? #echo $buy->Form('bolt', $boltItem['Item']['marketable_id'], $minersVehicle['MinersVehicle']['departing_city_id'], $boltPrice); ?>
<? $elementParams = array(
	'marketable' => array('Marketable' => array('id' => $boltItem['Item']['marketable_id'], 'name' => $boltItem['Item']['name'])),
	'price' => $market->commatize($boltPrice),
	'cityId' => $minersVehicle['MinersVehicle']['departing_city_id']);
echo $this->element('buy_form', $elementParams); ?>
<div style="display:inline">
	<? echo $html->link('Bolts', '/items/view/'.$boltItem['Item']['id']); ?> needed/owned in <? echo $minersVehicle['DepartingCity']['name']; ?>: <div id="BoltsNeeded" style="display:inline">0</div>/<span id="BoltsOwned" ><? echo $boltCount; ?></span>
</div>

<? if ($boltPrice)
	echo $this->element('buy_button', $elementParams);
