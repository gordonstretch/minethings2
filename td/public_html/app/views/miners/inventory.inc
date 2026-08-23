<div class="inventory">
	<h2>
	<span class="filter"><a href="javascript:void(0);" onclick="f = $('FilterDiv'); if (f.style.display == 'block') f.style.display='none'; else f.style.display='block';" >Filter</a></span>
	<span class="label"><strong><div id="CityNameDiv" style="display:inline;"><? echo $filterCityName; ?></div>&nbsp;Inventory</strong> - 
	<div id="ThingsCountDiv" style="display:inline">
	<? echo "$totalFilteredCount &nbsp; Global - $globalCount"; ?>
	</div>
	</span>
	</h2>
	<div id="FilterDiv" class="filter_content">

		<? 
		$useCache = isset($description) ? 1 : 0;
		$thingForm = $ajax->form('js_things/'.$owner['name'].'/'.$useCache, 'post', array(
			'model' => 'Miner',
			'update' => array('CityNameDiv', 'ThingsCountDiv', 'ThingsDiv'),
			'indicator' => 'LoadingDiv',
			'id' => 'ItemFilterForm',
			));
		//$thingForm = $form->create(NULL, array('action' => 'js_things/'.$owner['name']));
		echo $thingForm."\n";

		echo '<input type="hidden" name="data[LoadAll]" id="LoadAll_" value="0" />'; // force submission of LoadAll value
		echo '<input type="checkbox" name="data[LoadAll]" style="display:none" value="1" id="LoadAll" />';
		?>

		<div class="function">
			<h3>Filter by Function</h3>
			<ul>
			<?
			foreach($functions as $f)
			{
				$checked = ($f == 'All' ? 'checked' : '');
				echo '<li><input type="radio" name="data[Function]" id="Function'.$f.'" value="'.$f.'" onclick="$(\'MineTypeId0\').checked=true; $(\'SubmitButton\').click();" '.$checked.' /><label for="Function'.$f.'">'.$f.'</label></li>';
				
			}
			?>
			</ul>
		</div>
		<div id="MineSelector" class="mine">
			<h3>Filter by Mine</h3>
			<ul>
			<?
			$mineTypes = array(0 => 'All') + $mineTypes;
			foreach($mineTypes as $id => $name)
			{
				$name = substr($name, 0, 10);
				$checked = ($id == $this->data['MineType']['id'] ? 'checked' : '');
				echo '<li><input type="radio" name="data[MineType][id]" id="MineTypeId'.$id.'" value="'.$id.'" onclick="$(\'FunctionAll\').checked=true; $(\'SubmitButton\').click();" '.$checked.' /><label for="MineTypeId'.$id.'">'.$name.'</label></li>';

			}
			?>
			</ul>
		</div>
		<div class="city">
			<h3>Filter by City</h3>
			<ul>
			<?
			$cities = array_merge(array(array('name' => 'All', 'id' => 0)), $knownCities);
			foreach($cities as $city)
			{
				$checked = ($city['id'] == $this->data['City']['id'] ? 'checked' : '');
				echo '<li><input type="radio" name="data[City][id]" id="CityId'.$city['id'].'" value="'.$city['id'].'" onclick="$(\'SubmitButton\').click();" '.$checked.' /><label for="CityId'.$city['id'].'">'.$city['name'].'</label></li>';
			}
			?>
			</ul>
		</div>
		<div class="clear"></div>

		<?
		echo $form->end(array(
			'label' => 'submit',
			'id' => 'SubmitButton',
			'style' => 'display:none',
			))."\n"; 
		?>

	</div> <!-- filter content -->
	<div id="ThingsDiv">
		<? include 'things.inc'; ?>
	</div>
</div> <!-- inventory -->
<div class="melds">
	<h2>
	<? if (!$isOwner): ?>
	<span class="compare">
	<? echo $html->link('Compare', '/miners/compare_melds/'.$owner['name'], array(
		'class' => 'lightview', 
		'rel' => 'iframe', 
		'title' => ' :: :: width: 830, height: 430',
		)); ?>
	</span>
	<? endif; ?>
	<span class="label"><strong>Melds</strong> - <? echo $meldCount; ?> Melds</span>
	</h2>
	<div id="MeldsDiv">
		<? include 'melds.inc'; ?>
	</div>
</div> <!-- melds -->
<div class="clear"></div>
